import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser';
import { createHash } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { admitEmails, type AdmissionInput, type SmtpPrincipal } from '@mp/core';
import { withTenant, type Databases } from '@mp/database';
import { validateCustomHeaders } from '@mp/mail-protocol';
import { isAppError } from '@mp/shared';

export class SmtpReplyError extends Error {
  constructor(
    readonly responseCode: number,
    message: string,
  ) {
    super(message);
  }
}

/** Maps platform errors onto SMTP replies; quota problems are temporary so clients retry later. */
export function toSmtpError(err: unknown): SmtpReplyError {
  if (err instanceof SmtpReplyError) return err;
  if (isAppError(err)) {
    switch (err.code) {
      case 'validation_error':
      case 'idempotency_conflict':
        return new SmtpReplyError(550, `5.6.0 ${err.message}${err.details?.length ? `: ${err.details.map((d) => d.message).join('; ')}` : ''}`);
      case 'domain_not_verified':
      case 'sender_not_authorized':
      case 'account_suspended':
      case 'forbidden':
        return new SmtpReplyError(550, `5.7.1 ${err.message}`);
      case 'quota_exceeded':
      case 'rate_limited':
        return new SmtpReplyError(451, `4.7.1 ${err.message}`);
      case 'payload_too_large':
        return new SmtpReplyError(552, `5.3.4 ${err.message}`);
      default:
        break;
    }
  }
  return new SmtpReplyError(451, '4.3.0 Temporary failure, please retry');
}

export function ipAllowed(remote: string, cidrs: string[] | null): boolean {
  if (!cidrs || cidrs.length === 0) return true;
  if (!ipaddr.isValid(remote)) return false;
  let addr = ipaddr.parse(remote);
  if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) addr = (addr as ipaddr.IPv6).toIPv4Address();
  return cidrs.some((c) => {
    try {
      const [range, bits] = c.includes('/') ? ipaddr.parseCIDR(c) : [ipaddr.parse(c), addr.kind() === 'ipv4' ? 32 : 128];
      return range.kind() === addr.kind() && addr.match(range, bits);
    } catch {
      return false;
    }
  });
}

const addresses = (o: AddressObject | AddressObject[] | undefined): Array<{ address: string; name: string }> =>
  (Array.isArray(o) ? o : o ? [o] : []).flatMap((x) => x.value).flatMap((v) => (v.group ? v.group : [v])).filter((v) => !!v.address).map((v) => ({ address: v.address!.toLowerCase(), name: v.name }));

const fmt = (m: { address: string; name: string }) => (m.name ? `"${m.name.replace(/["\\]/g, '')}" <${m.address}>` : m.address);

/**
 * Converts a submitted RFC 5322 message into an admission request. The
 * envelope recipients are authoritative (they include BCC); header To/Cc are
 * only used to decide which recipients are visible.
 */
export function toAdmissionInput(parsed: ParsedMail, envelopeRcpts: string[]): AdmissionInput {
  const from = addresses(parsed.from);
  if (from.length !== 1) throw new SmtpReplyError(550, '5.6.0 message must have exactly one From address');
  const envelope = new Set(envelopeRcpts.map((r) => r.toLowerCase()));
  const toHdr = addresses(parsed.to).filter((a) => envelope.has(a.address));
  const ccHdr = addresses(parsed.cc).filter((a) => envelope.has(a.address));
  if (toHdr.length === 0) {
    throw new SmtpReplyError(550, '5.6.0 the To header must list at least one envelope recipient');
  }
  const visible = new Set([...toHdr, ...ccHdr].map((a) => a.address));
  const bcc = [...envelope].filter((r) => !visible.has(r));

  // Carry over only customer headers the API would also accept.
  const headers: Record<string, string> = {};
  for (const line of parsed.headerLines) {
    const value = line.line.slice(line.line.indexOf(':') + 1).trim().replace(/\r?\n[ \t]+/g, ' ');
    const name = line.line.slice(0, line.line.indexOf(':')).trim();
    if (!name.toLowerCase().startsWith('x-') && !['list-unsubscribe', 'list-unsubscribe-post', 'in-reply-to', 'references'].includes(line.key)) continue;
    if (validateCustomHeaders({ [name]: value }).length === 0 && !(name in headers)) headers[name] = value;
  }

  return {
    from: fmt(from[0]!),
    to: toHdr.map(fmt),
    cc: ccHdr.map(fmt),
    bcc,
    replyTo: addresses(parsed.replyTo).map(fmt),
    subject: (parsed.subject ?? '').trim() || '(no subject)',
    html: typeof parsed.html === 'string' ? parsed.html : undefined,
    text: parsed.text ?? undefined,
    attachments: parsed.attachments.map((a) => ({
      filename: a.filename ?? 'attachment',
      contentType: a.contentType,
      content: a.content,
      contentId: a.cid ?? a.contentId?.replace(/^<|>$/g, ''),
    })),
    headers,
    tags: [],
    metadata: {},
  };
}

export async function submitMessage(dbs: Databases, principal: SmtpPrincipal, envelopeRcpts: string[], raw: Buffer, localUnlimitedSending = false): Promise<string> {
  const parsed = await simpleParser(raw, { skipImageLinks: true, skipTextToHtml: true });
  const input = toAdmissionInput(parsed, envelopeRcpts);
  const rawKey = parsed.headers.get('x-mp-idempotency-key');
  const idempotencyKey = typeof rawKey === 'string' ? rawKey.trim() : undefined;
  if (rawKey !== undefined && (!idempotencyKey || idempotencyKey.length > 256)) throw new SmtpReplyError(550, '5.6.0 X-MP-Idempotency-Key must be 1-256 characters');
  const requestHash = createHash('sha256').update(raw).update('\0').update(JSON.stringify(envelopeRcpts.map((address) => address.toLowerCase()).sort())).digest('hex');
  try {
    const result = await withTenant(dbs.app, principal.orgId, (tx) =>
      admitEmails(
        tx,
        {
          orgId: principal.orgId,
          projectId: principal.projectId,
          actor: { type: 'smtp_credential', id: principal.credentialId },
          source: 'smtp',
          smtpCredentialId: principal.credentialId,
          restrictDomainId: principal.restrictDomainId,
        },
        [input],
        { idempotencyKey, requestHash, localUnlimitedSending },
      ),
    );
    return result.ids[0]!;
  } catch (err) {
    throw toSmtpError(err);
  }
}
