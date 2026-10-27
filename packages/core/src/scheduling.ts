import { randomUUID } from 'node:crypto';
import { and, asc, emails, emailRecipients, eq, type Tx } from '@mp/database';
import { AppError } from '@mp/shared';
import { recordEmailEvent } from './events';

/** All recipients are locked before changing any: a worker claim wins or rescheduling wins, never both. */
export async function rescheduleEmail(tx: Tx, orgId: string, projectId: string, id: string, scheduledAt: Date, now = new Date()) {
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt <= now || scheduledAt.getTime() - now.getTime() > 30 * 86400_000) {
    throw new AppError('validation_error', 'scheduled_at must be in the future and at most 30 days away');
  }
  const [email] = await tx.select().from(emails)
    .where(and(eq(emails.id, id), eq(emails.orgId, orgId), eq(emails.projectId, projectId))).for('update');
  if (!email) throw new AppError('not_found', 'email not found');
  const recipients = await tx.select().from(emailRecipients).where(eq(emailRecipients.emailId, id)).orderBy(asc(emailRecipients.id)).for('update');
  if (!email.scheduledAt || !recipients.some((r) => r.state === 'SCHEDULED') || recipients.some((r) => !['SCHEDULED', 'SUPPRESSED'].includes(r.state))) {
    throw new AppError('invalid_state', 'only scheduled emails not yet claimed for delivery can be rescheduled');
  }
  await tx.update(emailRecipients).set({ nextAttemptAt: scheduledAt })
    .where(and(eq(emailRecipients.emailId, id), eq(emailRecipients.state, 'SCHEDULED')));
  await tx.update(emails).set({ scheduledAt }).where(eq(emails.id, id));
  await recordEmailEvent(tx, {
    orgId, projectId, emailId: id, recipientId: null, type: 'email.rescheduled',
    data: { previous_scheduled_at: email.scheduledAt.toISOString(), scheduled_at: scheduledAt.toISOString() },
    dedupeKey: `${id}:rescheduled:${randomUUID()}`, occurredAt: now,
  });
  return { id, scheduled_at: scheduledAt.toISOString() };
}
