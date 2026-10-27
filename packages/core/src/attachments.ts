import { request } from 'node:https';
import { MAX_ATTACHMENTS_BYTES, type SendEmailRequest } from '@mp/contracts';
import { AppError } from '@mp/shared';
import { htmlToPlainText } from '@mp/mail-protocol';
import { resolveSafeTarget, validateUrlShape } from './ssrf';
import { fromApiRequest, type AdmissionInput } from './admission';

/** HTTPS only, pinned public DNS, no redirects, bounded bytes and a total deadline. */
export async function downloadAttachment(raw: string, maxBytes: number): Promise<Buffer> {
  const policy = { allowHttp: false, allowPrivateNetworks: false };
  const url = validateUrlShape(raw, policy);
  const target = await resolveSafeTarget(url, policy);
  if (maxBytes <= 0) throw new AppError('payload_too_large', 'attachments exceed the size limit');
  return new Promise<Buffer>((resolve, reject) => {
    const req = request(url, {
      method: 'GET', agent: false, signal: AbortSignal.timeout(10_000),
      headers: { accept: 'application/octet-stream', 'accept-encoding': 'identity' },
      lookup: (_host, options, callback) => {
        if (options.all) callback(null, [{ address: target.address, family: target.family }]);
        else callback(null, target.address, target.family);
      },
    }, (response) => {
      if (response.statusCode !== 200) {
        response.destroy();
        reject(new AppError('validation_error', 'remote attachment must return HTTP 200; redirects are not followed'));
        return;
      }
      if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
        response.destroy();
        reject(new AppError('validation_error', 'remote attachment must not use HTTP content encoding'));
        return;
      }
      if (Number(response.headers['content-length'] ?? 0) > maxBytes) {
        response.destroy();
        reject(new AppError('payload_too_large', 'remote attachment exceeds the size limit'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy();
          reject(new AppError('payload_too_large', 'remote attachment exceeds the size limit'));
        } else chunks.push(chunk);
      });
      response.once('error', () => reject(new AppError('validation_error', 'remote attachment download failed')));
      response.once('end', () => resolve(Buffer.concat(chunks)));
    });
    req.once('error', () => reject(new AppError('validation_error', 'remote attachment download failed or timed out')));
    req.end();
  });
}

export async function prepareApiEmails(requests: SendEmailRequest[]): Promise<AdmissionInput[]> {
  const inputs: AdmissionInput[] = [];
  let batchBytes = 0;
  for (const request of requests) {
    if (request.test_mode && request.attachments?.some((attachment) => attachment.path)) throw new AppError('validation_error', 'remote attachments are not allowed in test mode');
    const resolved: NonNullable<SendEmailRequest['attachments']> = [];
    let bytes = 0;
    for (const attachment of request.attachments ?? []) {
      const content = attachment.path
        ? await downloadAttachment(attachment.path, Math.min(MAX_ATTACHMENTS_BYTES - bytes, 24 * 1024 * 1024 - batchBytes))
        : Buffer.from(attachment.content!, 'base64');
      bytes += content.length;
      batchBytes += content.length;
      if (bytes > MAX_ATTACHMENTS_BYTES || batchBytes > 24 * 1024 * 1024) throw new AppError('payload_too_large', 'attachment size limit exceeded (10 MiB per email, 24 MiB per request)');
      resolved.push({ ...attachment, path: undefined, content: content.toString('base64') });
    }
    const text = request.text === undefined && request.html ? await htmlToPlainText(request.html) : request.text;
    inputs.push(fromApiRequest({ ...request, text, attachments: resolved }));
  }
  return inputs;
}
