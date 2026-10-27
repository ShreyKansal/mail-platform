import { open, stat } from 'node:fs/promises';
import { suppress, transitionRecipient } from '@mp/core';
import {
  bounceEvents,
  emailDeliveryAttempts,
  emailRecipients,
  emails,
  eq,
  mtaQueueMessages,
  workerCheckpoints,
  type Db,
  type Tx,
} from '@mp/database';
import { classify, decodeVerp, parsePostfixLine, type PostfixEvent } from '@mp/mail-protocol';
import { metrics } from '@mp/observability';
import type { Logger } from '@mp/shared';

export const CHECKPOINT = 'postfix-log';
const MAX_CHUNK = 1024 * 1024;

export interface ReconcilerOptions {
  logPath: string;
  verpSecret: string;
}

/**
 * Tails the Postfix maillog and converts delivery lines into recipient state
 * transitions. Each chunk is applied in one transaction together with the new
 * file offset, so a crash can neither skip nor double-apply a line.
 */
export class PostfixLogReconciler {
  constructor(
    private readonly db: Db,
    private readonly opts: ReconcilerOptions,
    private readonly log: Logger,
  ) {}

  async tick(): Promise<number> {
    let st;
    try {
      st = await stat(this.opts.logPath);
    } catch {
      this.log.warn({ path: this.opts.logPath }, 'postfix log not found yet');
      return 0;
    }
    const fileId = `${st.dev}:${st.ino}:${Math.floor(st.birthtimeMs)}`;
    const [cp] = await this.db.select().from(workerCheckpoints).where(eq(workerCheckpoints.name, CHECKPOINT));
    let position = cp?.fileId === fileId && cp.position <= st.size ? cp.position : 0;
    if (cp && position === 0 && cp.position > 0) this.log.info({ fileId }, 'postfix log rotated or truncated; reading from start');

    metrics.reconcilerLagBytes.set(Math.max(0, st.size - position));
    if (cp?.watermarkAt) metrics.reconcilerWatermarkAge.set((Date.now() - cp.watermarkAt.getTime()) / 1000);
    if (position >= st.size) {
      await this.saveCheckpoint(this.db, fileId, position, new Date());
      metrics.reconcilerWatermarkAge.set(0);
      return 0;
    }

    const fh = await open(this.opts.logPath, 'r');
    let buf: Buffer;
    try {
      const length = Math.min(MAX_CHUNK, st.size - position);
      buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, position);
      buf = buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }

    const lastNewline = buf.lastIndexOf(0x0a);
    if (lastNewline === -1) return 0; // partial line; wait for the rest
    const complete = buf.subarray(0, lastNewline + 1);
    const lines = complete.toString('utf8').split('\n');
    lines.pop();

    let offset = position;
    let applied = 0;
    let lastAt: Date | null = null;
    await this.db.transaction(async (tx) => {
      for (const line of lines) {
        const lineOffset = offset;
        offset += Buffer.byteLength(line, 'utf8') + 1;
        const ev = parsePostfixLine(line);
        if (!ev) continue;
        lastAt = ev.at;
        if (await this.apply(tx, ev, `${fileId}:${lineOffset}`)) applied += 1;
      }
      const reachedEof = position + complete.length >= st.size;
      await this.saveCheckpoint(tx, fileId, position + complete.length, reachedEof ? new Date() : lastAt);
    });
    return lines.length;
  }

  private async saveCheckpoint(db: Db | Tx, fileId: string, position: number, watermark: Date | null): Promise<void> {
    await db
      .insert(workerCheckpoints)
      .values({ name: CHECKPOINT, fileId, position, heartbeatAt: new Date(), watermarkAt: watermark })
      .onConflictDoUpdate({
        target: workerCheckpoints.name,
        set: { fileId, position, heartbeatAt: new Date(), ...(watermark ? { watermarkAt: watermark } : {}) },
      });
  }

  private async recipientForQueue(tx: Tx, queueId: string) {
    const [row] = await tx
      .select({ recipientId: mtaQueueMessages.recipientId, orgId: mtaQueueMessages.orgId })
      .from(mtaQueueMessages)
      .where(eq(mtaQueueMessages.queueId, queueId));
    return row ?? null;
  }

  private async apply(tx: Tx, ev: PostfixEvent, cause: string): Promise<boolean> {
    switch (ev.kind) {
      case 'queued': {
        const verp = decodeVerp(ev.from, this.opts.verpSecret);
        if (!verp) return false; // not platform mail (e.g. Postfix-generated DSNs with from=<>)
        const [rcpt] = await tx
          .select({ id: emailRecipients.id, orgId: emailRecipients.orgId })
          .from(emailRecipients)
          .where(eq(emailRecipients.id, verp.recipientId));
        if (!rcpt) return false;
        await tx
          .insert(mtaQueueMessages)
          .values({ queueId: ev.queueId, recipientId: rcpt.id, orgId: rcpt.orgId, seenAt: ev.at })
          .onConflictDoNothing();
        return true;
      }
      case 'expired': {
        const r = await this.recipientForQueue(tx, ev.queueId);
        if (!r) return false;
        await transitionRecipient(tx, {
          recipientId: r.recipientId,
          to: 'FAILED',
          patch: { bounceClass: 'retry_expired', lastResponse: 'message expired in the MTA queue after repeated temporary failures' },
          cause,
          occurredAt: ev.at,
          eventData: { reason: 'retry_expired', mta_queue_id: ev.queueId },
        });
        return true;
      }
      case 'delivery':
        return this.applyDelivery(tx, ev, cause);
      case 'removed':
        return false;
    }
  }

  private async applyDelivery(tx: Tx, ev: Extract<PostfixEvent, { kind: 'delivery' }>, cause: string): Promise<boolean> {
    const r = await this.recipientForQueue(tx, ev.queueId);
    if (!r) return false;

    const code = ev.reply?.code ?? null;
    const enhanced = ev.reply?.enhanced ?? (ev.dsn || null);
    const response = ev.reply?.text ?? ev.detail;
    const cls = classify(code, enhanced, response);
    const smtp = { code, enhanced_status: enhanced, response, remote_host: ev.relay, in_reply_to: ev.inReplyTo };

    await tx.insert(emailDeliveryAttempts).values({
      orgId: r.orgId,
      recipientId: r.recipientId,
      stage: 'remote',
      outcome: ev.status,
      mtaQueueId: ev.queueId,
      remoteHost: ev.relay,
      smtpCode: code,
      enhancedStatus: enhanced,
      response,
      occurredAt: ev.at,
    });
    const patch = { mtaQueueId: ev.queueId, lastSmtpCode: code, lastEnhancedStatus: enhanced, lastResponse: response, leaseOwner: null, leaseExpiresAt: null };

    if (ev.status === 'sent') {
      const res = await transitionRecipient(tx, { recipientId: r.recipientId, to: 'REMOTE_ACCEPTED', patch, cause, occurredAt: ev.at, eventData: { smtp } });
      if (res?.applied) {
        metrics.remoteAccepted.inc();
        const [email] = await tx.select({ createdAt: emails.createdAt }).from(emails).where(eq(emails.id, res.emailId));
        if (email) metrics.deliveryLatency.observe(Math.max(0, (ev.at.getTime() - email.createdAt.getTime()) / 1000));
      }
      return true;
    }

    if (ev.status === 'deferred') {
      if (cls.class === 'tls_failure') metrics.smtpTlsFailures.inc();
      metrics.deferred.inc();
      await transitionRecipient(tx, {
        recipientId: r.recipientId,
        to: 'DEFERRED',
        patch: { ...patch, bounceClass: cls.class },
        cause,
        occurredAt: ev.at,
        eventData: { smtp, classification: cls.class, retry_owner: 'mta' },
      });
      return true;
    }

    // bounced / per-recipient expired: permanent for this recipient.
    const expired = ev.status === 'expired';
    const finalClass = expired ? 'retry_expired' : cls.class;
    const res = await transitionRecipient(tx, {
      recipientId: r.recipientId,
      to: expired ? 'FAILED' : 'BOUNCED',
      patch: { ...patch, bounceClass: finalClass },
      cause,
      occurredAt: ev.at,
      eventData: { smtp, classification: finalClass, hard: cls.suppress && !expired },
    });
    if (!expired) {
      metrics.bounced.inc({ class: finalClass });
      await recordBounce(tx, {
        orgId: r.orgId,
        recipientId: r.recipientId,
        source: 'postfix_log',
        classification: finalClass,
        hard: cls.suppress,
        smtpCode: code,
        enhancedStatus: enhanced,
        diagnostic: response,
        receivedAt: ev.at,
      });
      if (cls.suppress && res) {
        const [rcpt] = await tx.select({ address: emailRecipients.address }).from(emailRecipients).where(eq(emailRecipients.id, r.recipientId));
        if (rcpt) await suppress(tx, { orgId: r.orgId, address: rcpt.address, reason: 'hard_bounce', detail: `${enhanced ?? code ?? ''} ${finalClass}`.trim(), sourceRecipientId: r.recipientId });
      }
    }
    return true;
  }
}

export interface BounceRecord {
  orgId: string;
  recipientId: string;
  source: 'postfix_log' | 'dsn';
  classification: string;
  hard: boolean;
  smtpCode: number | null;
  enhancedStatus: string | null;
  diagnostic: string | null;
  receivedAt: Date;
}

/** One bounce record per recipient and status, whichever source (log line or DSN) reports it first. */
export async function recordBounce(tx: Tx, b: BounceRecord): Promise<void> {
  await tx
    .insert(bounceEvents)
    .values({ ...b, dedupeKey: `bounce:${b.recipientId}:${b.enhancedStatus ?? b.smtpCode ?? 'unknown'}` })
    .onConflictDoNothing({ target: bounceEvents.dedupeKey });
}
