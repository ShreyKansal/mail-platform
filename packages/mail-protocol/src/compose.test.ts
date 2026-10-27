import { simpleParser } from 'mailparser';
import { describe, expect, it } from 'vitest';
import { composeSignedMessage, generateDkimKey } from './compose';

describe('inline attachment composition', () => {
  it('preserves CID references and regular attachment disposition in signed MIME', async () => {
    const key = generateDkimKey();
    const image = Buffer.from('an image payload');
    const raw = await composeSignedMessage({
      from: { address: 'sender@example.test' }, to: [{ address: 'reader@example.test' }], cc: [], replyTo: [],
      subject: 'Inline image', html: '<p>Hello<img src="cid:logo"></p>', text: 'Hello', headers: {},
      messageId: 'inline@example.test', date: new Date(), platformHeaders: {},
      dkim: { domain: 'example.test', selector: key.selector, privateKeyPem: key.privateKeyPem },
      attachments: [{ filename: 'logo.png', contentType: 'image/png', content: image, contentId: 'logo' }, { filename: 'note.txt', contentType: 'text/plain', content: Buffer.from('note') }],
    });
    const parsed = await simpleParser(raw, { skipImageLinks: true });
    expect(raw.toString()).toContain('DKIM-Signature:');
    expect(parsed.html).toContain('cid:logo');
    expect(parsed.attachments.find((a) => a.contentId === '<logo>')).toMatchObject({ contentDisposition: 'inline', content: image });
    expect(parsed.attachments.find((a) => a.filename === 'note.txt')?.contentDisposition).toBe('attachment');
  });
});
