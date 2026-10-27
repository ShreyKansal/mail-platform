import { describe, expect, it } from 'vitest';
import { downloadAttachment, prepareApiEmails } from './attachments';

describe('remote attachment policy', () => {
  it.each(['http://example.com/file', 'file:///etc/passwd', 'https://127.0.0.1/file', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/file', 'https://user:password@example.com/file'])('rejects unsafe URL %s before downloading', async (url) => {
    await expect(downloadAttachment(url, 1024)).rejects.toMatchObject({ code: 'validation_error' });
  });
  it('decodes base64 and retains content IDs without network access', async () => {
    const [email] = await prepareApiEmails([{ from: 'a@example.test', to: 'b@example.test', subject: 'x', text: 'x', attachments: [{ filename: 'a.png', content: 'aGk=', content_id: 'logo' }] }]);
    expect(email?.attachments[0]).toMatchObject({ content: Buffer.from('hi'), contentId: 'logo' });
  });
  it('rejects oversized decoded content before admission', async () => {
    await expect(prepareApiEmails([{ from: 'a@example.test', to: 'b@example.test', subject: 'x', text: 'x', attachments: [{ filename: 'a.txt', content: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64') }] }])).rejects.toMatchObject({ code: 'payload_too_large' });
  });
  it('generates a text alternative for HTML and honors an explicit empty text part', async () => {
    const [automatic, disabled] = await prepareApiEmails([
      { from: 'a@example.test', to: 'b@example.test', subject: 'x', html: '<h1>Hello</h1><p>Readable content</p>' },
      { from: 'a@example.test', to: 'b@example.test', subject: 'x', html: '<h1>Hello</h1>', text: '' },
    ]);
    expect(automatic?.text).toContain('Readable content');
    expect(automatic?.text).not.toContain('<p>');
    expect(disabled?.text).toBe('');
  });
});
