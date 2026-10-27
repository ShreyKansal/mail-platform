import { createHash } from 'node:crypto';
import { and, emailEvents, emails, eq, sql, webhookDeliveries, webhookEndpoints, type DbOrTx } from '@mp/database';
import type { EventType } from '@mp/contracts';

/** RFC 4122 v8-style UUID derived from a key, for events that must be idempotent across replays. */
export function deterministicUuid(key: string): string {
  const h = createHash('sha256').update(key).digest();
  h[6] = (h[6]! & 0x0f) | 0x80;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export interface EmailEventInput {
  orgId: string;
  projectId: string;
  emailId: string;
  recipientId: string | null;
  type: EventType;
  data: Record<string, unknown>;
  /** Deterministic key; replays with the same key are no-ops. */
  dedupeKey: string;
  occurredAt: Date;
}

/**
 * Records an email event and, in the same transaction, enqueues a webhook
 * delivery for every subscribed endpoint (transactional outbox). Returns the
 * event id, or null if the event was already recorded.
 */
export async function recordEmailEvent(tx: DbOrTx, ev: EmailEventInput): Promise<string | null> {
  const [email] = await tx.select({ isTest: emails.isTest }).from(emails).where(and(eq(emails.id, ev.emailId), eq(emails.orgId, ev.orgId)));
  const eventData = { ...ev.data, test_mode: email?.isTest ?? false };
  const id = deterministicUuid(`email-event:${ev.dedupeKey}`);
  const inserted = await tx
    .insert(emailEvents)
    .values({
      id,
      orgId: ev.orgId,
      projectId: ev.projectId,
      emailId: ev.emailId,
      recipientId: ev.recipientId,
      type: ev.type,
      data: eventData,
      dedupeKey: ev.dedupeKey,
      occurredAt: ev.occurredAt,
    })
    .onConflictDoNothing({ target: emailEvents.dedupeKey })
    .returning({ id: emailEvents.id });
  if (inserted.length === 0) return null;

  await enqueueWebhooks(tx, {
    orgId: ev.orgId,
    projectId: ev.projectId,
    eventId: id,
    type: ev.type,
    createdAt: ev.occurredAt,
    data: { email_id: ev.emailId, ...(ev.recipientId ? { recipient_id: ev.recipientId } : {}), ...eventData },
  });
  return id;
}

export interface WebhookEventInput {
  orgId: string;
  projectId: string;
  eventId: string;
  type: EventType;
  createdAt: Date;
  data: Record<string, unknown>;
}

export async function enqueueWebhooks(tx: DbOrTx, ev: WebhookEventInput): Promise<number> {
  const endpoints = await tx
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.orgId, ev.orgId),
        eq(webhookEndpoints.projectId, ev.projectId),
        eq(webhookEndpoints.enabled, true),
        sql`${ev.type} = any(${webhookEndpoints.eventTypes})`,
      ),
    );
  if (endpoints.length === 0) return 0;
  const payload = { id: ev.eventId, type: ev.type, created_at: ev.createdAt.toISOString(), data: ev.data };
  const rows = await tx
    .insert(webhookDeliveries)
    .values(
      endpoints.map((e) => ({
        orgId: ev.orgId,
        endpointId: e.id,
        eventId: ev.eventId,
        eventType: ev.type,
        payload,
      })),
    )
    .onConflictDoNothing({ target: [webhookDeliveries.endpointId, webhookDeliveries.eventId] })
    .returning({ id: webhookDeliveries.id });
  return rows.length;
}
