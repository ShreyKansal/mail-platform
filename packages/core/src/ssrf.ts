import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { AppError } from '@mp/shared';

/**
 * Outbound-request guard for customer-supplied URLs (webhooks).
 *
 * Only globally routable unicast addresses are allowed. The resolved address
 * must be the one actually connected to (the dispatcher pins it), otherwise a
 * DNS rebinding attack could pass validation and then connect internally.
 */
export interface UrlPolicy {
  /** Allow http:// (development only). */
  allowHttp: boolean;
  /** Allow private/loopback targets (development only, never in production). */
  allowPrivateNetworks: boolean;
}

export function isPublicAddress(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let addr = ipaddr.parse(ip);
  if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  }
  return addr.range() === 'unicast';
}

export function validateUrlShape(raw: string, policy: UrlPolicy): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError('validation_error', 'invalid URL', [{ path: 'url', message: 'invalid URL' }]);
  }
  const allowed = policy.allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!allowed.includes(url.protocol)) {
    throw new AppError('validation_error', 'webhook URLs must use https', [{ path: 'url', message: 'https required' }]);
  }
  if (url.username || url.password) {
    throw new AppError('validation_error', 'credentials in URLs are not allowed', [{ path: 'url', message: 'remove user:password@' }]);
  }
  if (url.port && !['443', '80', '8443'].includes(url.port) && !policy.allowPrivateNetworks) {
    throw new AppError('validation_error', 'webhook URLs may only use ports 443, 80 or 8443', [{ path: 'url', message: 'port not allowed' }]);
  }
  return url;
}

/** Resolves the URL host and returns an address that is safe to connect to. */
export async function resolveSafeTarget(url: URL, policy: UrlPolicy): Promise<{ address: string; family: 4 | 6 }> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const results = ipaddr.isValid(host)
    ? [{ address: host, family: ipaddr.parse(host).kind() === 'ipv6' ? 6 : 4 }]
    : await lookup(host, { all: true, verbatim: true }).catch(() => {
        throw new AppError('validation_error', `could not resolve ${host}`, [{ path: 'url', message: 'host does not resolve' }]);
      });
  if (results.length === 0) throw new AppError('validation_error', `could not resolve ${host}`);
  if (!policy.allowPrivateNetworks) {
    const bad = results.find((r) => !isPublicAddress(r.address));
    if (bad) {
      throw new AppError('validation_error', 'webhook URL resolves to a private or reserved address', [
        { path: 'url', message: 'private, loopback, link-local and reserved ranges are blocked' },
      ]);
    }
  }
  const first = results[0]!;
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}
