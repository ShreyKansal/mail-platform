import type { LookupAddress } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { Agent, request } from 'undici';
import { resolveSafeTarget, signWebhook, validateUrlShape, writeAudit, type UrlPolicy } from '@mp/core';
import { and, eq, notifications, sql, webhookAttempts, webhookDeliveries, webhookEndpoints, type Db } from '@mp/database';
import { metrics } from '@mp/observability';
import { isAppError, type Logger, type SecretBox } from '@mp/shared';

/** Delay before retry N (1-based). After the last entry the delivery is dead-lettered (~24h total). */
export const RETRY_SCHEDULE_SECONDS = [30, 120, 600, 1800, 3600, 3 * 3600, 6 * 3600, 12 * 3600];
const TIMEOUT_MS = 10_000;
const LEASE_SECONDS = 60;

type ClaimedDelivery = {
  id: string;
  org_id: string;
  endpoint_id: string;
  event_id: string;
  payload: Record<string, unknown>;
  attempts: number;
  retry_cycle_attempts: number;
};

export interface SendResult {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
}

export type Sender = (url: string, headers: Record<string, string>, body: string) => Promise<SendResult>;

/**
 * Production sender: resolves and validates the target, then connects to that
 * exact address (pinned lookup) so DNS rebinding cannot redirect the request
 * to an internal service after validation. Redirects are never followed.
 */
export function createSender(policy: UrlPolicy, userAgent: string): Sender {
  return async (rawUrl, headers, body) => {
    const started = Date.now();
    let agent: Agent | undefined;
    try {
      const url = validateUrlShape(rawUrl, policy);
      const target = await resolveSafeTarget(url, policy);
      const entry: LookupAddress = { address: target.address, family: target.family };
      const pinnedLookup: LookupFunction = (_host, options, callback) => {
        if (options.all) callback(null, [entry]);
        else callback(null, entry.address, entry.family);
      };
      agent = new Agent({ connect: { timeout: TIMEOUT_MS, lookup: pinnedLookup } });
      const res = await request(url, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json', 'user-agent': userAgent },
        body,
        dispatcher: agent,
        headersTimeout: TIMEOUT_MS,
        bodyTimeout: TIMEOUT_MS,
      });
      // Drain at most a little of the body; receivers' responses are not stored.
      await res.body.dump({ limit: 4096 }).catch(() => undefined);
      const ok = res.statusCode >= 200 && res.statusCode < 300;
      return { ok, statusCode: res.statusCode, error: ok ? null : `HTTP ${res.statusCode}`, durationMs: Date.now() - started };
    } catch (err) {
      const message = isAppError(err) ? err.message : ((err as Error).message ?? 'request failed');
      return { ok: false, statusCode: null, error: message.slice(0, 300), durationMs: Date.now() - started };
    } finally {
      await agent?.close().catch(() => undefined);
    }
  };
}

export class WebhookDispatcher {
  constructor(
    private readonly db: Db,
    private readonly secrets: SecretBox,
    private readonly send: Sender,
    private readonly log: Logger,
    private readonly batchSize = 20,
    private readonly health: { failureThreshold?: number; failureWindowMs?: number; now?: () => Date } = {},
  ) {}

  async tick(): Promise<number> {
    const res = await this.db.execute<ClaimedDelivery>(sql`
      update webhook_deliveries
         set status = 'delivering', attempts = attempts + 1, retry_cycle_attempts = retry_cycle_attempts + 1, lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS})
       where id in (
         select id from webhook_deliveries
          where (status in ('pending', 'retrying') and next_attempt_at <= now())
             or (status = 'delivering' and lease_expires_at < now())
          order by next_attempt_at
          limit ${this.batchSize}
          for update skip locked)
      returning id, org_id, endpoint_id, event_id, payload, attempts, retry_cycle_attempts`);
    await Promise.all(res.rows.map((d) => this.deliver(d)));
    return res.rows.length;
  }

  private async deliver(d: ClaimedDelivery): Promise<void> {
    const [endpoint] = await this.db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, d.endpoint_id));
    if (!endpoint || !endpoint.enabled) {
      await this.db
        .update(webhookDeliveries)
        .set({ status: 'dead', lastError: 'endpoint disabled or deleted', completedAt: new Date(), leaseExpiresAt: null })
        .where(and(eq(webhookDeliveries.id, d.id), eq(webhookDeliveries.status, 'delivering'), eq(webhookDeliveries.attempts, d.attempts)));
      return;
    }

    const body = JSON.stringify(d.payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const aad = `webhook:${endpoint.id}`;
    const signatures = [signWebhook(this.secrets.open(endpoint.secretSealed, aad), d.event_id, timestamp, body)];
    // During a rotation overlap, also sign with the previous secret (space-separated, per Standard Webhooks).
    if (endpoint.previousSecretSealed && endpoint.previousSecretExpiresAt && endpoint.previousSecretExpiresAt > new Date()) {
      signatures.push(signWebhook(this.secrets.open(endpoint.previousSecretSealed, aad), d.event_id, timestamp, body));
    }
    const headers = {
      'webhook-id': d.event_id,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': signatures.join(' '),
      'webhook-attempt': String(d.attempts),
    };
    const result = await this.send(endpoint.url, headers, body);
    if (!result.ok) metrics.webhookFailures.inc({ reason: result.statusCode ? 'http_status' : 'transport' });

    const retryDelay = RETRY_SCHEDULE_SECONDS[d.retry_cycle_attempts - 1];
    const next = result.ok
      ? { status: 'succeeded' as const, completedAt: new Date() }
      : retryDelay !== undefined
        ? { status: 'retrying' as const, nextAttemptAt: new Date(Date.now() + retryDelay * 1000) }
        : { status: 'dead' as const, completedAt: new Date() };

    await this.db.transaction(async (tx) => {
      // Match replay/configuration lock order: endpoint before delivery.
      const [current] = await tx.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, endpoint.id)).for('update');
      await tx.insert(webhookAttempts).values({
        orgId: d.org_id,
        deliveryId: d.id,
        attemptNo: d.attempts,
        statusCode: result.statusCode,
        error: result.error,
        durationMs: result.durationMs,
      });
      const applied = await tx
        .update(webhookDeliveries)
        .set({ ...next, lastStatusCode: result.statusCode, lastError: result.error, leaseExpiresAt: null })
        .where(and(eq(webhookDeliveries.id, d.id), eq(webhookDeliveries.status, 'delivering'), eq(webhookDeliveries.attempts, d.attempts))).returning({ id: webhookDeliveries.id });
      if (!applied.length) return;
      if (!current?.enabled || current.healthGeneration !== endpoint.healthGeneration) return;
      const now = this.health.now?.() ?? new Date();
      if (result.ok) {
        await tx.update(webhookEndpoints).set({ consecutiveFailures: 0, firstFailureAt: null, lastSuccessAt: now }).where(eq(webhookEndpoints.id, endpoint.id));
      } else {
        const consecutiveFailures = current.consecutiveFailures + 1;
        const firstFailureAt = current.firstFailureAt ?? now;
        const disable = consecutiveFailures >= (this.health.failureThreshold ?? 10) && now.getTime() - firstFailureAt.getTime() >= (this.health.failureWindowMs ?? 24 * 3600_000);
        await tx.update(webhookEndpoints).set({ consecutiveFailures, firstFailureAt, lastFailureAt: now,
          ...(disable ? { enabled: false, disabledReason: 'sustained_delivery_failures', healthGeneration: current.healthGeneration + 1, updatedAt: now } : {}) }).where(eq(webhookEndpoints.id, endpoint.id));
        if (disable) {
          await tx.insert(notifications).values({ orgId: current.orgId, projectId: current.projectId, type: 'webhook.disabled', resourceId: current.id,
            message: `Webhook endpoint ${current.id} was disabled after ${consecutiveFailures} consecutive failed attempts. Fix the receiver, then re-enable it and send a test event.` });
          await writeAudit(tx, { orgId: current.orgId, actor: { type: 'system', id: null }, action: 'webhook.auto_disabled', targetType: 'webhook', targetId: current.id, metadata: { consecutive_failures: consecutiveFailures } });
          metrics.webhookAutoDisabled.inc();
        }
      }
    });
    if (next.status === 'dead') this.log.warn({ deliveryId: d.id, endpointId: endpoint.id }, 'webhook delivery dead-lettered');
  }
}
