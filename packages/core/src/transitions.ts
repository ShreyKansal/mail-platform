import { and, emailRecipients, emails, eq, inArray, sql, type DbOrTx } from '@mp/database';
import { sourcesFor, type RecipientState } from '@mp/mail-protocol';
import type { EventType } from '@mp/contracts';
import { recordEmailEvent } from './events';

type RecipientPatch = Partial<
  Pick<
    typeof emailRecipients.$inferInsert,
    | 'nextAttemptAt'
    | 'leaseOwner'
    | 'leaseExpiresAt'
    | 'mtaQueueId'
    | 'lastSmtpCode'
    | 'lastEnhancedStatus'
    | 'lastResponse'
    | 'bounceClass'
  >
>;

const EVENT_FOR_STATE: Partial<Record<RecipientState, EventType>> = {
  MTA_ACCEPTED: 'email.mta_accepted',
  DEFERRED: 'email.deferred',
  REMOTE_ACCEPTED: 'email.remote_accepted',
  BOUNCED: 'email.bounced',
  FAILED: 'email.failed',
  CANCELLED: 'email.cancelled',
  DELIVERY_UNKNOWN: 'email.delivery_unknown',
  SUPPRESSED: 'email.suppressed',
};

export interface TransitionInput {
  recipientId: string;
  to: RecipientState;
  patch?: RecipientPatch;
  /** Deterministic identity of the cause (log offset, DSN id, attempt no.) for event idempotency. */
  cause: string;
  occurredAt: Date;
  eventData?: Record<string, unknown>;
}

export interface TransitionResult {
  from: RecipientState | null;
  applied: boolean;
  orgId: string;
  emailId: string;
}

/**
 * Applies a guarded state transition: the UPDATE only matches rows whose
 * current state may legally move to `to`, so concurrent writers (dispatcher,
 * reconciler, bounce processor) can never regress a recipient.
 */
export async function transitionRecipient(tx: DbOrTx, input: TransitionInput): Promise<TransitionResult | null> {
  const sources = sourcesFor(input.to);
  const prior = tx
    .select({ state: emailRecipients.state, stateChangedAt: emailRecipients.stateChangedAt })
    .from(emailRecipients)
    .where(eq(emailRecipients.id, input.recipientId));
  const [before] = await prior.for('update');
  if (!before) return null;
  // Event times are monotonic per recipient. Postfix logs have one-second
  // resolution, so a remote outcome can otherwise appear to precede the hand-off.
  const occurredAt = input.occurredAt < before.stateChangedAt ? before.stateChangedAt : input.occurredAt;

  const updated = await tx
    .update(emailRecipients)
    .set({ state: input.to, stateChangedAt: sql`now()`, ...(input.patch ?? {}) })
    .where(and(eq(emailRecipients.id, input.recipientId), inArray(emailRecipients.state, sources)))
    .returning({
      orgId: emailRecipients.orgId,
      emailId: emailRecipients.emailId,
      address: emailRecipients.address,
    });

  const row = updated[0];
  if (!row) {
    const [current] = await tx
      .select({ orgId: emailRecipients.orgId, emailId: emailRecipients.emailId })
      .from(emailRecipients)
      .where(eq(emailRecipients.id, input.recipientId));
    return current ? { from: before.state, applied: false, ...current } : null;
  }

  const type = EVENT_FOR_STATE[input.to];
  if (type) {
    const [email] = await tx.select({ projectId: emails.projectId }).from(emails).where(eq(emails.id, row.emailId));
    await recordEmailEvent(tx, {
      orgId: row.orgId,
      projectId: email!.projectId,
      emailId: row.emailId,
      recipientId: input.recipientId,
      type,
      data: { to: row.address, previous_state: before.state, state: input.to, ...(input.eventData ?? {}) },
      dedupeKey: `${input.recipientId}:${input.to}:${input.cause}`,
      occurredAt,
    });
  }
  return { from: before.state, applied: true, orgId: row.orgId, emailId: row.emailId };
}
