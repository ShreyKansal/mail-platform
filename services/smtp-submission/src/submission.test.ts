import { simpleParser } from 'mailparser';
import { describe, expect, it } from 'vitest';
import { AppError } from '@mp/shared';
import { ipAllowed, toAdmissionInput, toSmtpError, SmtpReplyError } from './submission';

const raw = (headers: string) =>
  Buffer.from(`${headers}\r\nSubject: Hi\r\nMIME-Version: 1.0\r\nContent-Type: text/plain\r\n\r\nHello\r\n`);

describe('SMTP submission conversion', () => {
  it('keeps inline content IDs without RFC angle brackets', async () => {
    const parsed = await simpleParser(Buffer.from('From: a@example.com\r\nTo: b@x.test\r\nSubject: Inline\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="parts"\r\n\r\n--parts\r\nContent-Type: text/html\r\n\r\n<img src="cid:logo">\r\n--parts\r\nContent-Type: image/png\r\nContent-ID: <logo>\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: inline; filename="logo.png"\r\n\r\naGVsbG8=\r\n--parts--\r\n'), { skipImageLinks: true });
    const input = toAdmissionInput(parsed, ['b@x.test']);
    expect(input.html).toContain('cid:logo');
    expect(input.attachments[0]).toMatchObject({ contentId: 'logo', content: Buffer.from('hello') });
  });
  it('uses envelope recipients as the source of truth and keeps BCC out of headers', async () => {
    const parsed = await simpleParser(
      raw('From: "Acme" <noreply@example.com>\r\nTo: a@x.test, notinenvelope@x.test\r\nCc: c@x.test\r\nX-Entity-Ref: 42\r\nX-MP-Email-Id: forged'),
    );
    const input = toAdmissionInput(parsed, ['a@x.test', 'c@x.test', 'hidden@x.test']);
    expect(input.from).toBe('"Acme" <noreply@example.com>');
    expect(input.to).toEqual(['a@x.test']);
    expect(input.cc).toEqual(['c@x.test']);
    expect(input.bcc).toEqual(['hidden@x.test']);
    expect(input.headers).toEqual({ 'X-Entity-Ref': '42' });
  });

  it('rejects messages without exactly one From or without a visible To', async () => {
    await expect(async () => toAdmissionInput(await simpleParser(raw('To: a@x.test')), ['a@x.test'])).rejects.toBeInstanceOf(SmtpReplyError);
    await expect(async () => toAdmissionInput(await simpleParser(raw('From: a@example.com\r\nTo: b@x.test')), ['c@x.test'])).rejects.toBeInstanceOf(
      SmtpReplyError,
    );
  });
});

describe('SMTP error mapping', () => {
  it.each([
    [new AppError('domain_not_verified', 'x'), 550],
    [new AppError('sender_not_authorized', 'x'), 550],
    [new AppError('quota_exceeded', 'x'), 451],
    [new AppError('validation_error', 'x'), 550],
    [new Error('db down'), 451],
  ])('%s -> %i', (err, code) => {
    expect(toSmtpError(err).responseCode).toBe(code);
  });
});

describe('credential IP restrictions', () => {
  it('matches IPv4, IPv6 and mapped addresses', () => {
    expect(ipAllowed('203.0.113.7', null)).toBe(true);
    expect(ipAllowed('203.0.113.7', ['203.0.113.0/24'])).toBe(true);
    expect(ipAllowed('::ffff:203.0.113.7', ['203.0.113.0/24'])).toBe(true);
    expect(ipAllowed('198.51.100.1', ['203.0.113.0/24'])).toBe(false);
    expect(ipAllowed('2001:db8::1', ['2001:db8::/32'])).toBe(true);
    expect(ipAllowed('203.0.113.7', ['203.0.113.7'])).toBe(true);
    expect(ipAllowed('garbage', ['0.0.0.0/0'])).toBe(false);
  });
});
