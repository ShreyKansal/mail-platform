import { parseSmtpReply, sanitizeSmtpText, type SmtpReply } from './smtp-status';

/**
 * Parser for Postfix `maillog_file` lines (syslog-style timestamps), e.g.
 *
 *   Oct 21 10:29:51 mta postfix/qmgr[185]: 4j8lsC4NDrzB94: from=<b+…@bounce.example.com>, size=254, nrcpt=1 (queue active)
 *   Oct 21 10:29:51 mta postfix/smtp[263]: 4j8lsC4BfmzB92: to=<a@b.c>, relay=mx[1.2.3.4]:25, delay=0.22,
 *       delays=…, dsn=5.1.1, status=bounced (host mx[1.2.3.4] said: 550 5.1.1 … (in reply to RCPT TO command))
 */
export type PostfixEvent =
  | { kind: 'queued'; at: Date; queueId: string; from: string; size: number; nrcpt: number }
  | {
      kind: 'delivery';
      at: Date;
      queueId: string;
      to: string;
      relay: string | null;
      dsn: string;
      status: 'sent' | 'deferred' | 'bounced' | 'expired';
      /** Remote reply when the remote server answered; otherwise null. */
      reply: SmtpReply | null;
      /** Sanitized status explanation (parenthesised text). */
      detail: string;
      /** Which SMTP command the remote reply was in response to, if stated. */
      inReplyTo: string | null;
    }
  | { kind: 'expired'; at: Date; queueId: string; from: string }
  | { kind: 'removed'; at: Date; queueId: string };

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

const LINE =
  /^(?:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))|([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?)\s+\S+\s+postfix(?:\/[\w./-]+)?\[\d+\]:\s+([0-9A-Za-z]{10,20}):\s+(.*)$/;

/**
 * Syslog timestamps have no year or zone. Postfix in our containers runs in UTC;
 * the year is inferred so that a line is never more than ~1 month in the future.
 */
function syslogDate(mon: string, day: string, h: string, mi: string, s: string, frac: string | undefined, now: Date): Date {
  const month = MONTHS[mon];
  if (month === undefined) return new Date(Number.NaN);
  let year = now.getUTCFullYear();
  if (month - now.getUTCMonth() > 1) year -= 1;
  const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
  return new Date(Date.UTC(year, month, Number(day), Number(h), Number(mi), Number(s), ms));
}

const field = (body: string, name: string): string | null => {
  const m = new RegExp(`(?:^|, )${name}=([^,]*?)(?=, [a-z_]+=|$| \\()`).exec(body);
  return m?.[1] ?? null;
};

const unbracket = (v: string | null): string => (v ?? '').replace(/^<|>$/g, '');

export function parsePostfixLine(line: string, now: Date = new Date()): PostfixEvent | null {
  const m = LINE.exec(line.trimEnd());
  if (!m) return null;
  const at = m[1] ? new Date(m[1]) : syslogDate(m[2]!, m[3]!, m[4]!, m[5]!, m[6]!, m[7], now);
  const queueId = m[8]!;
  const body = m[9]!;

  if (body === 'removed') return { kind: 'removed', at, queueId };

  if (body.startsWith('from=<')) {
    const from = unbracket(field(body, 'from'));
    if (/status=expired/.test(body)) return { kind: 'expired', at, queueId, from };
    if (!/\(queue active\)/.test(body)) return null;
    return {
      kind: 'queued',
      at,
      queueId,
      from,
      size: Number(field(body, 'size') ?? 0),
      nrcpt: Number(field(body, 'nrcpt') ?? 0),
    };
  }

  if (body.startsWith('to=<')) {
    const sm = /, status=(sent|deferred|bounced|expired) \((.*)\)$/.exec(body);
    if (!sm) return null;
    const detailRaw = sm[2] ?? '';
    const said = /said: (.*?)(?: \(in reply to ([A-Z ]+?) command\))?$/.exec(detailRaw);
    let reply: SmtpReply | null = null;
    let inReplyTo: string | null = null;
    if (said?.[1]) {
      reply = parseSmtpReply(said[1]);
      inReplyTo = said[2] ?? null;
    } else if (sm[1] === 'sent' && /^[2-5]\d\d[ -]/.test(detailRaw)) {
      reply = parseSmtpReply(detailRaw);
    }
    const relay = field(body, 'relay');
    return {
      kind: 'delivery',
      at,
      queueId,
      to: unbracket(field(body, 'to')),
      relay: relay && relay !== 'none' ? relay : null,
      dsn: field(body, 'dsn') ?? '',
      status: sm[1] as 'sent' | 'deferred' | 'bounced' | 'expired',
      reply,
      detail: sanitizeSmtpText(detailRaw),
      inReplyTo,
    };
  }
  return null;
}

/** Extracts the queue id from a Postfix "250 2.0.0 Ok: queued as XXXX" reply. */
export function queueIdFromReply(response: string): string | null {
  return /queued as ([0-9A-Za-z]{10,20})/.exec(response)?.[1] ?? null;
}
