/**
 * SMTP reply parsing and bounce classification (RFC 5321 reply codes,
 * RFC 3463 enhanced status codes).
 */
export interface SmtpReply {
  code: number | null;
  enhanced: string | null;
  text: string;
}

const REPLY = /^\s*([2-5]\d\d)(?:[ -])?(?:([245]\.\d{1,3}\.\d{1,3})\s*)?(.*)$/s;
const ENHANCED = /\b([245]\.\d{1,3}\.\d{1,3})\b/;

export function parseSmtpReply(raw: string): SmtpReply {
  const text = sanitizeSmtpText(raw);
  const m = REPLY.exec(text);
  if (!m) {
    const e = ENHANCED.exec(text);
    return { code: null, enhanced: e?.[1] ?? null, text };
  }
  return { code: Number(m[1]), enhanced: m[2] ?? ENHANCED.exec(m[3] ?? '')?.[1] ?? null, text };
}

/** Removes control characters and caps length so responses are safe to store and display. */
export function sanitizeSmtpText(raw: string, max = 500): string {
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

export type BounceClass =
  | 'mailbox_unavailable'
  | 'domain_invalid'
  | 'recipient_rejected'
  | 'mailbox_full'
  | 'content_rejected'
  | 'policy_rejected'
  | 'authentication_rejected'
  | 'greylisted'
  | 'temporary_network'
  | 'tls_failure'
  | 'soft_bounce'
  | 'retry_expired'
  | 'unknown';

export interface Classification {
  class: BounceClass;
  /** Permanent failure for this recipient (5xx). */
  permanent: boolean;
  /** Hard bounce: the address itself is bad and should be suppressed. */
  suppress: boolean;
}

const MAILBOX_TEXT =
  /user unknown|unknown user|no such user|does not exist|doesn't exist|mailbox unavailable|mailbox not found|invalid recipient|recipient not found|address rejected|no mailbox|account (?:is )?disabled|unrouteable address/i;

export function classify(code: number | null, enhanced: string | null, text = ''): Classification {
  const cls = enhanced?.[0] ?? (code ? String(code)[0] : null);
  const permanent = cls === '5';
  const [, subject, detail] = (enhanced ?? '').split('.').map(Number);

  if (cls === '4') {
    if (/greylist|grey-list|graylist|try again later/i.test(text) || (subject === 7 && detail === 1 && /later/i.test(text))) {
      return { class: 'greylisted', permanent: false, suppress: false };
    }
    if (subject === 2 && detail === 2) return { class: 'mailbox_full', permanent: false, suppress: false };
    if (subject === 4) return { class: 'temporary_network', permanent: false, suppress: false };
    if (subject === 7 && (detail === 4 || detail === 5)) return { class: 'tls_failure', permanent: false, suppress: false };
    return { class: 'soft_bounce', permanent: false, suppress: false };
  }

  if (cls === '5') {
    if (subject === 1) {
      if (detail === 2) return { class: 'domain_invalid', permanent, suppress: true };
      if (detail === 3) return { class: 'recipient_rejected', permanent, suppress: true };
      if (detail === 1 || detail === 0 || detail === 6 || detail === 10) {
        return { class: 'mailbox_unavailable', permanent, suppress: true };
      }
    }
    if (subject === 2) {
      if (detail === 1) return { class: 'mailbox_unavailable', permanent, suppress: true };
      if (detail === 2) return { class: 'mailbox_full', permanent, suppress: false };
      if (detail === 3) return { class: 'content_rejected', permanent, suppress: false };
    }
    if (subject === 4 && (detail === 4 || detail === 1)) return { class: 'domain_invalid', permanent, suppress: true };
    if (subject === 6) return { class: 'content_rejected', permanent, suppress: false };
    if (subject === 7) {
      if (detail !== undefined && [23, 25, 26, 27].includes(detail)) {
        return { class: 'authentication_rejected', permanent, suppress: false };
      }
      return { class: 'policy_rejected', permanent, suppress: false };
    }
    if (MAILBOX_TEXT.test(text)) return { class: 'mailbox_unavailable', permanent, suppress: true };
    return { class: 'recipient_rejected', permanent, suppress: false };
  }

  return { class: 'unknown', permanent: false, suppress: false };
}
