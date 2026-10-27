import { generateKeyPairSync, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import type { Mailbox } from './address';

export interface DkimSigner {
  domain: string;
  selector: string;
  privateKeyPem: string;
}

export interface ComposeInput {
  from: Mailbox;
  to: Mailbox[];
  cc: Mailbox[];
  replyTo: Mailbox[];
  subject: string;
  html?: string | null;
  text?: string | null;
  headers: Record<string, string>;
  attachments: Array<{ filename: string; contentType: string; content: Buffer; contentId?: string | null | undefined }>;
  /** Without angle brackets. */
  messageId: string;
  date: Date;
  /** Platform-managed headers (Feedback-ID, X-MP-Email-Id, List-Unsubscribe …). */
  platformHeaders: Record<string, string>;
  dkim: DkimSigner;
}

/** Headers covered by the DKIM signature, in addition to those present by default. */
export const DKIM_SIGNED_HEADERS = [
  'from',
  'sender',
  'reply-to',
  'subject',
  'date',
  'message-id',
  'to',
  'cc',
  'mime-version',
  'content-type',
  'content-transfer-encoding',
  'in-reply-to',
  'references',
  'list-id',
  'list-unsubscribe',
  'list-unsubscribe-post',
  'feedback-id',
].join(':');

// A buffering transport: nodemailer composes and DKIM-signs, nothing is sent.
const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });

const fmt = (m: Mailbox) => (m.name ? { name: m.name, address: m.address } : m.address);

/**
 * Builds the RFC 5322 message once per email. The envelope (VERP sender,
 * single recipient) is applied separately at hand-off so one signed message
 * serves every recipient.
 */
export async function composeSignedMessage(input: ComposeInput): Promise<Buffer> {
  const info = await composer.sendMail({
    from: fmt(input.from),
    to: input.to.map(fmt),
    cc: input.cc.length ? input.cc.map(fmt) : undefined,
    replyTo: input.replyTo.length ? input.replyTo.map(fmt) : undefined,
    subject: input.subject,
    html: input.html ?? undefined,
    text: input.text ?? undefined,
    messageId: `<${input.messageId}>`,
    date: input.date,
    headers: { ...input.headers, ...input.platformHeaders },
    attachments: input.attachments.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      content: a.content,
      cid: a.contentId ?? undefined,
      contentDisposition: a.contentId ? 'inline' : 'attachment',
    })),
    // Never allow the composer to read local files or fetch URLs referenced in content.
    disableFileAccess: true,
    disableUrlAccess: true,
    // Envelope is irrelevant for composition but required by the transport.
    envelope: { from: input.from.address, to: input.to.map((t) => t.address) },
    dkim: {
      domainName: input.dkim.domain,
      keySelector: input.dkim.selector,
      privateKey: input.dkim.privateKeyPem,
      headerFieldNames: DKIM_SIGNED_HEADERS,
    },
  });
  const message = (info as unknown as { message: Buffer }).message;
  if (!Buffer.isBuffer(message)) throw new Error('composer did not return a buffer');
  return message;
}

export interface GeneratedDkimKey {
  selector: string;
  bits: number;
  privateKeyPem: string;
  /** Base64 SubjectPublicKeyInfo, the `p=` tag value. */
  publicKeyBase64: string;
}

export function generateDkimKey(bits = 2048, now = new Date()): GeneratedDkimKey {
  if (bits < 2048) throw new Error('DKIM keys must be at least 2048 bits');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: bits,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(3).toString('hex');
  return {
    selector: `mp${stamp}${suffix}`,
    bits,
    privateKeyPem: privateKey,
    publicKeyBase64: publicKey.toString('base64'),
  };
}

export const dkimTxtValue = (publicKeyBase64: string): string => `v=DKIM1; k=rsa; p=${publicKeyBase64}`;

/** Derive a readable text alternative without loading resources or executing HTML. */
export async function htmlToPlainText(html: string): Promise<string> {
  const raw = Buffer.from(`MIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(html).toString('base64')}\r\n`);
  const parsed = await simpleParser(raw, { skipImageLinks: true });
  return parsed.text ?? '';
}
