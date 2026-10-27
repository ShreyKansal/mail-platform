import { spf as evaluateSpf } from 'mailauth';
import { getDomain } from 'tldts';
import type { DnsAnswer, DnsClient } from './dns-client';
import { isDmarcRecord, isSpfRecord, parseDkimRecord, parseDmarc, parseSpf } from './parsers';

export type RecordPurpose = 'ownership' | 'dkim' | 'return_path_mx' | 'return_path_spf' | 'dmarc';
export type RecordStatus =
  | 'pending'
  | 'valid'
  | 'missing'
  | 'invalid'
  | 'partial'
  | 'conflict'
  | 'temp_error'
  | 'resolution_failed';

export interface ExpectedRecord {
  purpose: RecordPurpose;
  type: 'TXT' | 'MX';
  host: string;
  value: string;
  priority: number | null;
  /** Required records gate sending; others are advisory or optional features. */
  required: boolean;
}

export interface RecordCheck {
  status: RecordStatus;
  observed: string[];
  detail: string;
}

export interface PlatformMailIdentity {
  spfInclude: string;
  bounceMxHost: string;
  /** Public outbound IPs. When set, SPF is evaluated for real instead of by include matching. */
  outboundIps: string[];
}

export interface VerifyContext {
  dns: DnsClient;
  platform: PlatformMailIdentity;
  /** Optional authoritative lookup used to detect propagation delay. */
  authoritative?: (host: string) => Promise<DnsClient | null>;
}

export const OWNERSHIP_PREFIX = 'mp-verification=';

export const organizationalDomain = (domain: string): string => getDomain(domain) ?? domain;

export interface ExpectedRecordInput {
  domain: string;
  ownershipToken: string;
  dkimSelector: string;
  dkimTxtValue: string;
  returnPathLabel: string;
  platform: PlatformMailIdentity;
}

export function expectedRecords(input: ExpectedRecordInput): ExpectedRecord[] {
  const rp = `${input.returnPathLabel}.${input.domain}`;
  return [
    {
      purpose: 'ownership',
      type: 'TXT',
      host: `_mp-challenge.${input.domain}`,
      value: `${OWNERSHIP_PREFIX}${input.ownershipToken}`,
      priority: null,
      required: true,
    },
    {
      purpose: 'dkim',
      type: 'TXT',
      host: `${input.dkimSelector}._domainkey.${input.domain}`,
      value: input.dkimTxtValue,
      priority: null,
      required: true,
    },
    { purpose: 'return_path_mx', type: 'MX', host: rp, value: input.platform.bounceMxHost, priority: 10, required: false },
    {
      purpose: 'return_path_spf',
      type: 'TXT',
      host: rp,
      value: `v=spf1 include:${input.platform.spfInclude} -all`,
      priority: null,
      required: false,
    },
    {
      purpose: 'dmarc',
      type: 'TXT',
      host: `_dmarc.${organizationalDomain(input.domain)}`,
      value: 'v=DMARC1; p=none;',
      priority: null,
      required: false,
    },
  ];
}

function failure(answer: Extract<DnsAnswer<unknown>, { ok: false }>): RecordCheck | null {
  if (answer.failure === 'nxdomain' || answer.failure === 'nodata') return null;
  if (answer.failure === 'temporary') return { status: 'temp_error', observed: [], detail: answer.message };
  return { status: 'resolution_failed', observed: [], detail: answer.message };
}

const missing = (host: string, what: string): RecordCheck => ({
  status: 'missing',
  observed: [],
  detail: `No ${what} record found at ${host}.`,
});

async function checkOwnership(rec: ExpectedRecord, dns: DnsClient): Promise<RecordCheck> {
  const ans = await dns.txt(rec.host);
  if (!ans.ok) return failure(ans) ?? missing(rec.host, 'TXT');
  const ours = ans.records.filter((r) => r.startsWith(OWNERSHIP_PREFIX));
  if (ours.includes(rec.value)) return { status: 'valid', observed: ours, detail: 'Ownership token found.' };
  if (ours.length) {
    return {
      status: 'invalid',
      observed: ours,
      detail: 'A different verification token is published. Tokens are unique per account and domain; copy the value shown for this domain.',
    };
  }
  return { status: 'missing', observed: ans.records, detail: `No ${OWNERSHIP_PREFIX} TXT record found at ${rec.host}.` };
}

async function checkDkim(rec: ExpectedRecord, dns: DnsClient): Promise<RecordCheck> {
  const ans = await dns.txt(rec.host);
  if (!ans.ok) return failure(ans) ?? missing(rec.host, 'DKIM TXT');
  const keys = ans.records.filter((r) => /(^|;)\s*p\s*=/i.test(r));
  if (keys.length === 0) return { status: 'missing', observed: ans.records, detail: `No DKIM key record found at ${rec.host}.` };
  if (keys.length > 1) {
    return { status: 'conflict', observed: keys, detail: 'Multiple DKIM records are published for this selector; keep exactly one.' };
  }
  const parsed = parseDkimRecord(keys[0]!);
  const expected = parseDkimRecord(rec.value).value.publicKey;
  if (parsed.value.revoked) return { status: 'invalid', observed: keys, detail: 'The published key is revoked (empty p=).' };
  if (!parsed.valid) return { status: 'invalid', observed: keys, detail: parsed.errors.join('; ') };
  if (parsed.value.publicKey !== expected) {
    return {
      status: 'invalid',
      observed: keys,
      detail: 'The published public key does not match the key generated for this domain. Check for truncation when pasting long TXT values.',
    };
  }
  return {
    status: 'valid',
    observed: keys,
    detail: parsed.value.testing ? 'Key matches (t=y testing flag is set; receivers may ignore failures).' : 'Key matches.',
  };
}

async function checkReturnPathMx(rec: ExpectedRecord, dns: DnsClient): Promise<RecordCheck> {
  const ans = await dns.mx(rec.host);
  if (!ans.ok) return failure(ans) ?? missing(rec.host, 'MX');
  const observed = ans.records.map((r) => `${r.priority} ${r.exchange}`);
  const expected = rec.value.toLowerCase().replace(/\.$/, '');
  const hosts = ans.records.map((r) => r.exchange);
  if (hosts.length > 0 && hosts.every((h) => h === expected)) return { status: 'valid', observed, detail: 'Bounce MX points to the platform.' };
  if (hosts.includes(expected)) {
    return { status: 'conflict', observed, detail: 'Additional MX hosts are present; bounces may be delivered elsewhere. Remove them.' };
  }
  return { status: 'invalid', observed, detail: `MX must point to ${expected}.` };
}

async function checkReturnPathSpf(rec: ExpectedRecord, ctx: VerifyContext): Promise<RecordCheck> {
  const ans = await ctx.dns.txt(rec.host);
  if (!ans.ok) return failure(ans) ?? missing(rec.host, 'SPF TXT');
  const spfs = ans.records.filter(isSpfRecord);
  if (spfs.length === 0) return { status: 'missing', observed: ans.records, detail: `No SPF record found at ${rec.host}.` };
  if (spfs.length > 1) {
    return { status: 'conflict', observed: spfs, detail: 'Multiple SPF records cause a permanent error (RFC 7208 §4.5); merge them into one.' };
  }
  const parsed = parseSpf(spfs[0]!);
  if (!parsed.valid) return { status: 'invalid', observed: spfs, detail: parsed.errors.join('; ') };

  if (ctx.platform.outboundIps.length > 0) {
    const failures: string[] = [];
    for (const ip of ctx.platform.outboundIps) {
      const res = await evaluateSpf({
        sender: `postmaster@${rec.host}`,
        ip,
        helo: rec.host,
        resolver: (name: string, type: string) => ctx.dns.raw(name, type) as Promise<string[][] | string[]>,
      });
      if (res.status.result === 'temperror') {
        return { status: 'temp_error', observed: spfs, detail: `SPF evaluation hit a temporary DNS error for ${ip}.` };
      }
      if (res.status.result !== 'pass') failures.push(`${ip}: ${res.status.result}`);
    }
    if (failures.length) {
      return { status: 'invalid', observed: spfs, detail: `SPF does not authorize all platform sending IPs (${failures.join(', ')}).` };
    }
    return { status: 'valid', observed: spfs, detail: 'SPF evaluates to pass for every platform sending IP.' };
  }

  const include = ctx.platform.spfInclude.toLowerCase();
  if (parsed.value.includes.includes(include)) return { status: 'valid', observed: spfs, detail: `SPF includes ${include}.` };
  return { status: 'invalid', observed: spfs, detail: `SPF must contain include:${include}.` };
}

async function checkDmarc(rec: ExpectedRecord, dns: DnsClient): Promise<RecordCheck> {
  const ans = await dns.txt(rec.host);
  if (!ans.ok) {
    const f = failure(ans);
    if (f) return f;
    return {
      status: 'missing',
      observed: [],
      detail: `No DMARC record at ${rec.host}. DMARC is required by major mailbox providers for bulk senders and for BIMI.`,
    };
  }
  const records = ans.records.filter(isDmarcRecord);
  if (records.length === 0) return { status: 'missing', observed: ans.records, detail: `No DMARC record at ${rec.host}.` };
  if (records.length > 1) return { status: 'conflict', observed: records, detail: 'Multiple DMARC records; receivers will ignore all of them.' };
  const parsed = parseDmarc(records[0]!);
  if (!parsed.valid) return { status: 'invalid', observed: records, detail: parsed.errors.join('; ') };
  const { policy, pct } = parsed.value;
  if (policy === 'none') {
    return { status: 'partial', observed: records, detail: 'DMARC is in monitoring mode (p=none). Enforcement (quarantine or reject) is needed for BIMI.' };
  }
  if (pct < 100) return { status: 'partial', observed: records, detail: `DMARC enforcement applies to ${pct}% of mail (pct=${pct}).` };
  return { status: 'valid', observed: records, detail: `DMARC enforcement active (p=${policy}).` };
}

async function checkWith(rec: ExpectedRecord, ctx: VerifyContext): Promise<RecordCheck> {
  switch (rec.purpose) {
    case 'ownership':
      return checkOwnership(rec, ctx.dns);
    case 'dkim':
      return checkDkim(rec, ctx.dns);
    case 'return_path_mx':
      return checkReturnPathMx(rec, ctx.dns);
    case 'return_path_spf':
      return checkReturnPathSpf(rec, ctx);
    case 'dmarc':
      return checkDmarc(rec, ctx.dns);
  }
}

/**
 * Checks one record via recursive DNS. When the record is missing or wrong,
 * the authoritative servers are consulted: if they already serve the expected
 * value, the record is reported as `pending` (propagating) instead.
 */
export async function checkRecord(rec: ExpectedRecord, ctx: VerifyContext): Promise<RecordCheck> {
  const result = await checkWith(rec, ctx);
  if ((result.status === 'missing' || result.status === 'invalid') && ctx.authoritative) {
    const auth = await ctx.authoritative(rec.host).catch(() => null);
    if (auth) {
      const authoritative = await checkWith(rec, { ...ctx, dns: auth });
      if (authoritative.status === 'valid') {
        return {
          status: 'pending',
          observed: result.observed,
          detail: 'Published at the authoritative nameservers; waiting for cached answers to expire (TTL).',
        };
      }
    }
  }
  return result;
}
