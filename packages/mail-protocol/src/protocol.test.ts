import { dkimVerify } from 'mailauth';
import { describe, expect, it } from 'vitest';
import {
  AddressError,
  aggregateStatus,
  canTransition,
  classify,
  composeSignedMessage,
  decodeVerp,
  dkimTxtValue,
  encodeVerp,
  generateDkimKey,
  normalizeDomain,
  parseDeliveryStatus,
  parseMailbox,
  parsePostfixLine,
  parseSmtpReply,
  queueIdFromReply,
  sourcesFor,
  TERMINAL_STATES,
  TRANSITIONS,
  validateCustomHeaders,
  validateSubject,
} from './index';

describe('address parsing', () => {
  it('parses bare and named mailboxes', () => {
    expect(parseMailbox('noreply@Example.COM')).toEqual({ address: 'noreply@example.com' });
    expect(parseMailbox('Acme <noreply@example.com>')).toEqual({ address: 'noreply@example.com', name: 'Acme' });
    expect(parseMailbox('"Acme, Inc." <billing@example.com>')).toEqual({
      address: 'billing@example.com',
      name: 'Acme, Inc.',
    });
  });

  it('converts internationalized domains to A-labels', () => {
    expect(parseMailbox('info@bücher.example').address).toBe('info@xn--bcher-kva.example');
    expect(normalizeDomain('Notify.Example.com.')).toBe('notify.example.com');
  });

  it.each([
    'Acme <a@example.com>\r\nBcc: victim@example.com',
    'a@example.com\nBcc: x@y.com',
    'no-at-sign',
    'a@localhost',
    'a@-bad-.com',
    'a..b@example.com',
    'a@example.com, b@example.com',
    `${'x'.repeat(65)}@example.com`,
    'josé@example.com',
  ])('rejects %j', (input) => {
    expect(() => parseMailbox(input)).toThrow(AddressError);
  });
});

describe('custom headers', () => {
  it('accepts X- headers and allow-listed standard headers', () => {
    expect(
      validateCustomHeaders({ 'X-Entity-Ref': 'abc', 'List-Unsubscribe': '<https://u.example.com/x>', References: '<a@b>' }),
    ).toEqual([]);
  });

  it('rejects reserved, unknown, duplicate and injected headers', () => {
    const issues = validateCustomHeaders({
      From: 'evil@example.com',
      'DKIM-Signature': 'x',
      Sender: 'x',
      'X-Ok': 'line\r\nBcc: victim@example.com',
      'Content-Type': 'text/html',
      Importance: 'high',
      'x-ok': 'dupe',
      'bad name': 'v',
    });
    expect(issues.map((i) => i.header).sort()).toEqual(
      ['Content-Type', 'DKIM-Signature', 'From', 'Importance', 'Sender', 'X-Ok', 'bad name', 'x-ok'].sort(),
    );
  });

  it('rejects subjects with line breaks', () => {
    expect(validateSubject('Hello\r\nBcc: x@y.z')).not.toBeNull();
    expect(validateSubject('Héllo — welcome')).toBeNull();
  });
});

describe('VERP', () => {
  const secret = 'test-secret-that-is-at-least-32-characters-long';
  const id = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';

  it('round-trips a recipient id', () => {
    const addr = encodeVerp(id, 'Bounce.Example.com', secret);
    expect(addr).toMatch(/^b\+[a-z2-7]{26}-[a-z2-7]{16}@bounce\.example\.com$/);
    expect(addr.split('@')[0]!.length).toBeLessThanOrEqual(64);
    expect(decodeVerp(addr.toUpperCase(), secret)).toEqual({ recipientId: id, domain: 'bounce.example.com' });
  });

  it('rejects forged or tampered tokens', () => {
    const addr = encodeVerp(id, 'bounce.example.com', secret);
    expect(decodeVerp(addr, `${secret}x`)).toBeNull();
    const tampered = addr.replace(/^b\+./, (m) => (m.endsWith('a') ? 'b+b' : 'b+a'));
    expect(decodeVerp(tampered, secret)).toBeNull();
    expect(decodeVerp('b+notvalid@bounce.example.com', secret)).toBeNull();
    expect(decodeVerp('postmaster@bounce.example.com', secret)).toBeNull();
  });
});

describe('SMTP replies and bounce classification', () => {
  it('parses codes and enhanced status', () => {
    expect(parseSmtpReply('550 5.1.1 <a@b.c>: Recipient address rejected')).toMatchObject({ code: 550, enhanced: '5.1.1' });
    expect(parseSmtpReply('550-5.7.26 Unauthenticated email')).toMatchObject({ code: 550, enhanced: '5.7.26' });
    expect(parseSmtpReply('421 Service not available')).toMatchObject({ code: 421, enhanced: null });
  });

  it.each([
    [550, '5.1.1', '', 'mailbox_unavailable', true, true],
    [550, '5.1.2', '', 'domain_invalid', true, true],
    [550, '5.4.4', '', 'domain_invalid', true, true],
    [552, '5.2.2', '', 'mailbox_full', true, false],
    [554, '5.6.0', '', 'content_rejected', true, false],
    [550, '5.7.1', '', 'policy_rejected', true, false],
    [550, '5.7.26', '', 'authentication_rejected', true, false],
    [451, '4.7.1', 'Greylisted, please try again later', 'greylisted', false, false],
    [421, '4.4.2', '', 'temporary_network', false, false],
    [452, '4.2.2', '', 'mailbox_full', false, false],
    [550, null, 'No such user here', 'mailbox_unavailable', true, true],
    [550, null, 'Rejected', 'recipient_rejected', true, false],
  ] as const)('%s %s %s -> %s', (code, enh, text, cls, permanent, suppress) => {
    expect(classify(code, enh, text)).toEqual({ class: cls, permanent, suppress });
  });
});

describe('Postfix log parsing (fixtures captured from postfix 3.7.11)', () => {
  const now = new Date('2026-10-21T12:00:00Z');

  it('parses qmgr queued lines', () => {
    const ev = parsePostfixLine(
      'Oct 21 10:29:51 mta postfix/qmgr[185]: 4j8lsC4NDrzB94: from=<b+abcdefghijklmnopqrstuvwxyz-abcdefghijklmnop@bounces.mail-platform.test>, size=254, nrcpt=1 (queue active)',
      now,
    );
    expect(ev).toEqual({
      kind: 'queued',
      at: new Date('2026-10-21T10:29:51Z'),
      queueId: '4j8lsC4NDrzB94',
      from: 'b+abcdefghijklmnopqrstuvwxyz-abcdefghijklmnop@bounces.mail-platform.test',
      size: 254,
      nrcpt: 1,
    });
  });

  it('parses a remote acceptance', () => {
    const ev = parsePostfixLine(
      'Oct 21 10:29:51 mta postfix/smtp[261]: 4j8lsC4W41zB95: to=<someone@gmail.com>, relay=mailpit[172.18.0.2]:1025, delay=0.14, delays=0.01/0.12/0/0.01, dsn=2.0.0, status=sent (250 2.0.0 Ok: queued as SbRyfSBG9SFMX6FmDps8QE)',
      now,
    );
    expect(ev).toMatchObject({
      kind: 'delivery',
      queueId: '4j8lsC4W41zB95',
      to: 'someone@gmail.com',
      relay: 'mailpit[172.18.0.2]:1025',
      dsn: '2.0.0',
      status: 'sent',
      reply: { code: 250, enhanced: '2.0.0' },
    });
  });

  it('parses a hard bounce with the remote reply', () => {
    const ev = parsePostfixLine(
      'Oct 21 10:29:51 mta postfix/smtp[263]: 4j8lsC4BfmzB92: to=<unknown1@mx-sim.test>, relay=mx-simulator[172.18.0.5]:2525, delay=0.22, delays=0.02/0.09/0.1/0.01, dsn=5.1.1, status=bounced (host mx-simulator[172.18.0.5] said: 550 5.1.1 The email account that you tried to reach does not exist (in reply to RCPT TO command))',
      now,
    );
    expect(ev).toMatchObject({
      kind: 'delivery',
      status: 'bounced',
      dsn: '5.1.1',
      inReplyTo: 'RCPT TO',
      reply: { code: 550, enhanced: '5.1.1', text: '550 5.1.1 The email account that you tried to reach does not exist' },
    });
  });

  it('parses deferrals without a remote reply', () => {
    const ev = parsePostfixLine(
      'Oct 21 10:29:51 mta postfix/smtp[261]: 4j8lsC4gW6zB96: to=<x@bounces.test>, relay=none, delay=0.13, delays=0.01/0.11/0/0, dsn=4.4.1, status=deferred (connect to host.docker.internal[192.168.65.254]:2525: Connection refused)',
      now,
    );
    expect(ev).toMatchObject({ kind: 'delivery', status: 'deferred', relay: null, reply: null, dsn: '4.4.1' });
  });

  it('parses expiry and removal and ignores noise', () => {
    expect(
      parsePostfixLine('Oct 21 10:39:51 mta postfix/qmgr[185]: 4j8lsC4NDrzB94: from=<b+x@y.z>, status=expired, returned to sender', now),
    ).toMatchObject({ kind: 'expired', queueId: '4j8lsC4NDrzB94' });
    expect(parsePostfixLine('Oct 21 10:29:51 mta postfix/qmgr[185]: 4j8lsC42CNzB90: removed', now)).toMatchObject({
      kind: 'removed',
    });
    expect(parsePostfixLine('Oct 21 10:29:02 mta postfix/master[1]: daemon started -- version 3.7.11', now)).toBeNull();
    expect(parsePostfixLine('Oct 21 10:29:51 mta postfix/cleanup[260]: 4j8lsC4NDrzB94: message-id=<>', now)).toBeNull();
  });

  it('infers the previous year for December lines read in January', () => {
    const ev = parsePostfixLine('Dec 31 23:59:59 mta postfix/qmgr[1]: 4j8lsC42CNzB90: removed', new Date('2027-01-01T00:00:05Z'));
    expect(ev?.at.toISOString()).toBe('2026-12-31T23:59:59.000Z');
  });

  it('extracts the queue id from the submission reply', () => {
    expect(queueIdFromReply('250 2.0.0 Ok: queued as 4j8lsC42CNzB90')).toBe('4j8lsC42CNzB90');
    expect(queueIdFromReply('250 OK')).toBeNull();
  });
});

describe('DSN parsing', () => {
  it('parses a Postfix non-delivery report', () => {
    const report = parseDeliveryStatus(
      [
        'Reporting-MTA: dns; mta.mail-platform.test',
        'X-Postfix-Queue-ID: 4j8lsC4BfmzB92',
        'Arrival-Date: Wed, 21 Oct 2026 10:29:51 +0000 (UTC)',
        '',
        'Final-Recipient: rfc822; unknown1@mx-sim.test',
        'Original-Recipient: rfc822;unknown1@mx-sim.test',
        'Action: failed',
        'Status: 5.1.1',
        'Remote-MTA: dns; mx-simulator',
        'Diagnostic-Code: smtp; 550 5.1.1 The email account that you tried to reach does',
        '    not exist',
        '',
      ].join('\r\n'),
    );
    expect(report.reportingMta).toBe('mta.mail-platform.test');
    expect(report.recipients).toEqual([
      {
        finalRecipient: 'unknown1@mx-sim.test',
        originalRecipient: 'unknown1@mx-sim.test',
        action: 'failed',
        status: '5.1.1',
        remoteMta: 'mx-simulator',
        smtpCode: 550,
        diagnostic: '550 5.1.1 The email account that you tried to reach does not exist',
      },
    ]);
  });
});

describe('recipient state machine', () => {
  it('has no transitions out of terminal states', () => {
    for (const s of TERMINAL_STATES) expect(TRANSITIONS[s]).toEqual([]);
  });

  it('never lets the application re-dispatch after MTA hand-off', () => {
    for (const s of ['MTA_ACCEPTED', 'DEFERRED', 'REMOTE_ACCEPTED'] as const) {
      expect(canTransition(s, 'DISPATCHING')).toBe(false);
      expect(canTransition(s, 'RETRYING')).toBe(false);
    }
  });

  it('allows late asynchronous bounces after remote acceptance', () => {
    expect(canTransition('REMOTE_ACCEPTED', 'BOUNCED')).toBe(true);
    expect(canTransition('BOUNCED', 'REMOTE_ACCEPTED')).toBe(false);
  });

  it('computes guarded source sets', () => {
    expect(sourcesFor('CANCELLED').sort()).toEqual(['QUEUED', 'RETRYING', 'SCHEDULED']);
    expect(aggregateStatus(['QUEUED', 'QUEUED'])).toBe('QUEUED');
    expect(aggregateStatus(['QUEUED', 'BOUNCED'])).toBe('PARTIAL');
  });
});

describe('MIME composition and DKIM', () => {
  it('produces a message whose DKIM signature verifies independently', async () => {
    const key = generateDkimKey(2048, new Date('2026-10-21T00:00:00Z'));
    expect(key.selector).toMatch(/^mp20261021[0-9a-f]{6}$/);
    const raw = await composeSignedMessage({
      from: { address: 'noreply@example.com', name: 'Acme' },
      to: [{ address: 'user@example.org' }],
      cc: [],
      replyTo: [{ address: 'support@example.com' }],
      subject: 'Welcome — ünïcode subject',
      html: '<p>Hello</p>',
      text: 'Hello',
      headers: { 'X-Entity-Ref': 'abc' },
      attachments: [{ filename: 'a.txt', contentType: 'text/plain', content: Buffer.from('attachment') }],
      messageId: 'test-1@mail.example.com',
      date: new Date('2026-10-21T10:00:00Z'),
      platformHeaders: { 'Feedback-ID': 'e1:o1:transactional:mp' },
      dkim: { domain: 'example.com', selector: key.selector, privateKeyPem: key.privateKeyPem },
    });
    const text = raw.toString('utf8');
    expect(text).toContain('Message-ID: <test-1@mail.example.com>');
    expect(text).not.toMatch(/^Bcc:/im);

    const txt = dkimTxtValue(key.publicKeyBase64);
    const result = await dkimVerify(raw, {
      resolver: async (name: string, type: string) => {
        if (type === 'TXT' && name === `${key.selector}._domainkey.example.com`) return [[txt]];
        const err = new Error('not found') as Error & { code: string };
        err.code = 'ENOTFOUND';
        throw err;
      },
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.status.result).toBe('pass');
    expect(result.results[0]?.signingDomain).toBe('example.com');
  });

  it('refuses weak DKIM keys', () => {
    expect(() => generateDkimKey(1024)).toThrow();
  });
});
