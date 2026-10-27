/**
 * Validation for customer-supplied headers. Anything that controls identity,
 * routing, authentication or MIME structure is owned by the platform.
 */
const RESERVED = new Set(
  [
    'from',
    'sender',
    'to',
    'cc',
    'bcc',
    'reply-to',
    'subject',
    'date',
    'message-id',
    'return-path',
    'received',
    'dkim-signature',
    'arc-seal',
    'arc-message-signature',
    'arc-authentication-results',
    'authentication-results',
    'received-spf',
    'mime-version',
    'content-type',
    'content-transfer-encoding',
    'content-disposition',
    'feedback-id',
    'x-mp-email-id',
    'x-mp-idempotency-key',
    'resent-from',
    'resent-sender',
    'resent-to',
    'resent-cc',
    'resent-bcc',
    'resent-date',
    'resent-message-id',
  ].map((h) => h.toLowerCase()),
);

/** Non `X-` headers customers may set. */
const ALLOWED_STANDARD = new Set([
  'list-unsubscribe',
  'list-unsubscribe-post',
  'list-id',
  'in-reply-to',
  'references',
  'auto-submitted',
  'precedence',
  'keywords',
  'comments',
]);

const NAME = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;
const BAD_VALUE = /[\u0000-\u0008\u000a-\u001f\u007f]/;

export interface HeaderIssue {
  header: string;
  message: string;
}

export function validateCustomHeaders(headers: Record<string, string>): HeaderIssue[] {
  const issues: HeaderIssue[] = [];
  const seen = new Set<string>();
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (!NAME.test(name)) {
      issues.push({ header: name, message: 'header name must be 1-64 characters of letters, digits and hyphens' });
      continue;
    }
    if (seen.has(lower)) {
      issues.push({ header: name, message: 'header is specified more than once' });
      continue;
    }
    seen.add(lower);
    if (RESERVED.has(lower)) {
      issues.push({ header: name, message: 'header is managed by the platform and cannot be set' });
      continue;
    }
    if (!lower.startsWith('x-') && !ALLOWED_STANDARD.has(lower)) {
      issues.push({ header: name, message: 'only X- headers and a documented allow-list of standard headers may be set' });
      continue;
    }
    if (typeof value !== 'string' || BAD_VALUE.test(value)) {
      issues.push({ header: name, message: 'header value must not contain line breaks or control characters' });
      continue;
    }
    if (value.length > 998) issues.push({ header: name, message: 'header value exceeds 998 characters' });
  }
  return issues;
}

/** Subjects may be Unicode (encoded by the composer) but never contain line breaks. */
export function validateSubject(subject: string): string | null {
  if (BAD_VALUE.test(subject)) return 'subject must not contain line breaks or control characters';
  if (subject.length > 998) return 'subject exceeds 998 characters';
  return null;
}
