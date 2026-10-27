import { createHash } from 'node:crypto';
import { simpleParser } from 'mailparser';
import { suppress, transitionRecipient } from '@mp/core';
import { bounceEvents, emailRecipients, eq, type Db } from '@mp/database';
import { classify, decodeVerp, parseDeliveryStatus, parseSmtpReply, type DsnRecipient } from '@mp/mail-protocol';
import { metrics } from '@mp/observability';
import type { Logger } from '@mp/shared';

export interface ProcessResult {
  recipients: number;
  applied: number;
}

/**
 * Processes one inbound message addressed to VERP bounce addresses. The RCPT
 * TO addresses (already HMAC-verified) identify which recipient deliveries the
 * report is about; the DSN body says what happened to them.
 */
export async function processBounce(
  db: Db,
  log: Logger,
  verpSecret: string,
  rcptTo: string[],
  raw: Buffer,
): Promise<ProcessResult> {
  const parsed = await simpleParser(raw, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
  const dsnPart = parsed.attachments.find((a) => a.contentType.toLowerCase() === 'message/delivery-status');
  const report = dsnPart ? parseDeliveryStatus(dsnPart.content.toString('utf8')) : null;
  const messageKey = createHash('sha256').update(raw).digest('hex').slice(0, 32);

  let applied = 0;
  for (const address of rcptTo) {
    const verp = decodeVerp(address, verpSecret);
    if (!verp) continue;
    const [rcpt] = await db
      .select({ id: emailRecipients.id, orgId: emailRecipients.orgId, address: emailRecipients.address, state: emailRecipients.state })
      .from(emailRecipients)
      .where(eq(emailRecipients.id, verp.recipientId));
    if (!rcpt) continue;

    // Match the DSN recipient block for this delivery (one recipient per VERP envelope).
    const entry: DsnRecipient | undefined =
      report?.recipients.find((x) => x.finalRecipient === rcpt.address.toLowerCase() || x.originalRecipient === rcpt.address.toLowerCase()) ??
      report?.recipients[0];

    let status = entry?.status ?? null;
    let code = entry?.smtpCode ?? null;
    let diagnostic = entry?.diagnostic ?? null;
    let action = entry?.action ?? null;
    if (!entry) {
      // Non-RFC 3464 bounce: best effort extraction from the human-readable text.
      const text = `${parsed.subject ?? ''}\n${parsed.text ?? ''}`;
      const m = /\b([45]\d\d)[ -]([45]\.\d{1,3}\.\d{1,3})\b/.exec(text) ?? /\b([45]\.\d{1,3}\.\d{1,3})\b/.exec(text);
      if (m) {
        const reply = parseSmtpReply(m[0]);
        code = reply.code;
        status = reply.enhanced;
        diagnostic = m[0];
        action = status?.startsWith('5') ? 'failed' : 'delayed';
      }
    }
    if (action !== 'failed' && action !== 'delayed') {
      log.info({ recipientId: rcpt.id, action }, 'bounce message without actionable status; recorded nothing');
      continue;
    }

    const cls = classify(code, status, diagnostic ?? '');
    await db.transaction(async (tx) => {
      if (action === 'delayed') {
        await transitionRecipient(tx, {
          recipientId: rcpt.id,
          to: 'DEFERRED',
          patch: { lastSmtpCode: code, lastEnhancedStatus: status, lastResponse: diagnostic, bounceClass: cls.class },
          cause: `dsn:${messageKey}`,
          occurredAt: new Date(),
          eventData: { source: 'dsn', classification: cls.class, smtp: { code, enhanced_status: status, response: diagnostic } },
        });
        return;
      }
      const res = await transitionRecipient(tx, {
        recipientId: rcpt.id,
        to: 'BOUNCED',
        patch: { lastSmtpCode: code, lastEnhancedStatus: status, lastResponse: diagnostic, bounceClass: cls.class },
        cause: `dsn:${messageKey}`,
        occurredAt: new Date(),
        eventData: {
          source: 'dsn',
          classification: cls.class,
          hard: cls.suppress,
          asynchronous: rcpt.state === 'REMOTE_ACCEPTED',
          smtp: { code, enhanced_status: status, response: diagnostic, remote_mta: entry?.remoteMta ?? null },
        },
      });
      await tx
        .insert(bounceEvents)
        .values({
          orgId: rcpt.orgId,
          recipientId: rcpt.id,
          source: 'dsn',
          classification: cls.class,
          hard: cls.suppress,
          smtpCode: code,
          enhancedStatus: status,
          diagnostic,
          dedupeKey: `bounce:${rcpt.id}:${status ?? code ?? 'unknown'}`,
          receivedAt: new Date(),
        })
        .onConflictDoNothing({ target: bounceEvents.dedupeKey });
      if (cls.suppress) {
        await suppress(tx, { orgId: rcpt.orgId, address: rcpt.address, reason: 'hard_bounce', detail: `${status ?? code ?? ''} ${cls.class}`.trim(), sourceRecipientId: rcpt.id });
      }
      if (res?.applied) {
        applied += 1;
        metrics.bounced.inc({ class: cls.class });
      }
    });
  }
  return { recipients: rcptTo.length, applied };
}
