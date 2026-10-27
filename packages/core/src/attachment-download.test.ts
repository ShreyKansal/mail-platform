import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ request: vi.fn(), lookup: vi.fn() }));
vi.mock('node:https', () => ({ request: mock.request }));
vi.mock('node:dns/promises', () => ({ lookup: mock.lookup }));
import { downloadAttachment } from './attachments';

describe('bounded pinned remote downloads', () => {
  let status: number;
  let body: Buffer;
  let headers: Record<string, string>;
  beforeEach(() => {
    vi.clearAllMocks(); status = 200; body = Buffer.from('attachment'); headers = {};
    mock.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mock.request.mockImplementation((_url, _options, callback) => {
      const request = new EventEmitter() as EventEmitter & { end: () => void };
      request.end = () => queueMicrotask(() => {
        const response = Object.assign(new PassThrough(), { statusCode: status, headers });
        callback(response);
        if (!response.destroyed) response.end(body);
      });
      return request;
    });
  });
  it('returns bytes, keeps the original TLS hostname and pins the validated address', async () => {
    expect(await downloadAttachment('https://files.example.test/a.pdf', 100)).toEqual(body);
    const [url, options] = mock.request.mock.calls[0]!;
    expect(url.hostname).toBe('files.example.test');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.agent).toBe(false);
    const callback = vi.fn(); options.lookup('files.example.test', { all: false }, callback);
    expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(mock.lookup).toHaveBeenCalledTimes(1);
  });
  it('rejects redirects without requesting the redirect destination', async () => {
    status = 302; headers = { location: 'https://127.0.0.1/private' };
    await expect(downloadAttachment('https://files.example.test/a', 100)).rejects.toMatchObject({ code: 'validation_error' });
    expect(mock.request).toHaveBeenCalledTimes(1);
  });
  it('rejects oversized declared and streamed bodies', async () => {
    headers = { 'content-length': '10000' };
    await expect(downloadAttachment('https://files.example.test/a', 3)).rejects.toMatchObject({ code: 'payload_too_large' });
    headers = {};
    await expect(downloadAttachment('https://files.example.test/a', 3)).rejects.toMatchObject({ code: 'payload_too_large' });
  });
  it('blocks mixed public/private DNS results before making a request', async () => {
    mock.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }]);
    await expect(downloadAttachment('https://files.example.test/a', 100)).rejects.toMatchObject({ code: 'validation_error' });
    expect(mock.request).not.toHaveBeenCalled();
  });
  it('rejects unexpected compression without decompressing', async () => {
    headers = { 'content-encoding': 'gzip' };
    await expect(downloadAttachment('https://files.example.test/a', 100)).rejects.toMatchObject({ code: 'validation_error' });
  });
});
