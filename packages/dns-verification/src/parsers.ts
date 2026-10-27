/**
 * Syntax-level parsers for SPF (RFC 7208), DKIM key records (RFC 6376 §3.6.1)
 * and DMARC (RFC 7489). Semantic evaluation (does IP X pass?) is done
 * separately against live DNS.
 */

export interface ParseResult<T> {
  valid: boolean;
  errors: string[];
  value: T;
}

// ---------------------------------------------------------------------------
// SPF
// ---------------------------------------------------------------------------

export interface SpfTerm {
  qualifier: '+' | '-' | '~' | '?';
  mechanism: string;
  value: string | null;
}

export interface SpfRecord {
  terms: SpfTerm[];
  modifiers: Record<string, string>;
  /** Mechanisms/modifiers in this record that cost a DNS lookup (not recursive). */
  directLookups: number;
  includes: string[];
  all: SpfTerm['qualifier'] | null;
}

const SPF_MECHANISMS = new Set(['all', 'include', 'a', 'mx', 'ptr', 'ip4', 'ip6', 'exists']);
const LOOKUP_MECHANISMS = new Set(['include', 'a', 'mx', 'ptr', 'exists']);
const IPV4_CIDR = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}(\/([0-9]|[12]\d|3[0-2]))?$/;

export const isSpfRecord = (txt: string): boolean => /^v=spf1(\s|$)/i.test(txt.trim());

export function parseSpf(record: string): ParseResult<SpfRecord> {
  const errors: string[] = [];
  const value: SpfRecord = { terms: [], modifiers: {}, directLookups: 0, includes: [], all: null };
  const parts = record.trim().split(/\s+/);
  if (parts[0]?.toLowerCase() !== 'v=spf1') {
    return { valid: false, errors: ['record must start with "v=spf1"'], value };
  }
  for (const part of parts.slice(1)) {
    const mod = /^([a-z][a-z0-9_.-]*)=(.*)$/i.exec(part);
    if (mod) {
      const name = mod[1]!.toLowerCase();
      if (value.modifiers[name] !== undefined) errors.push(`modifier "${name}" appears more than once`);
      value.modifiers[name] = mod[2]!;
      if (name === 'redirect') value.directLookups += 1;
      continue;
    }
    const m = /^([+\-~?]?)([a-z0-9]+)(?:[:/](.*))?$/i.exec(part);
    if (!m) {
      errors.push(`unrecognized term "${part}"`);
      continue;
    }
    const mechanism = m[2]!.toLowerCase();
    if (!SPF_MECHANISMS.has(mechanism)) {
      errors.push(`unknown mechanism "${mechanism}"`);
      continue;
    }
    const term: SpfTerm = {
      qualifier: ((m[1] || '+') as SpfTerm['qualifier']),
      mechanism,
      value: part.includes(':') ? part.slice(part.indexOf(':') + 1) : part.includes('/') ? part.slice(part.indexOf('/')) : null,
    };
    if (mechanism === 'ip4' && (!term.value || !IPV4_CIDR.test(term.value))) errors.push(`invalid ip4 value in "${part}"`);
    if (mechanism === 'ip6' && (!term.value || !/^[0-9a-f:.]+(\/\d{1,3})?$/i.test(term.value))) {
      errors.push(`invalid ip6 value in "${part}"`);
    }
    if ((mechanism === 'include' || mechanism === 'exists') && !term.value) errors.push(`"${mechanism}" requires a domain`);
    if (mechanism === 'include' && term.value) value.includes.push(term.value.toLowerCase());
    if (mechanism === 'all') value.all = term.qualifier;
    if (LOOKUP_MECHANISMS.has(mechanism)) value.directLookups += 1;
    value.terms.push(term);
  }
  if (value.directLookups > 10) errors.push(`record requires ${value.directLookups} DNS lookups (limit is 10)`);
  if (value.all === '+') errors.push('"+all" authorizes every host on the Internet to send for this domain');
  if (value.all && value.modifiers.redirect) errors.push('"redirect" is ignored when "all" is present');
  return { valid: errors.length === 0, errors, value };
}

// ---------------------------------------------------------------------------
// Tag-value lists (DKIM, DMARC)
// ---------------------------------------------------------------------------

function parseTags(record: string): { tags: Map<string, string>; order: string[]; errors: string[] } {
  const tags = new Map<string, string>();
  const order: string[] = [];
  const errors: string[] = [];
  for (const raw of record.split(';')) {
    const part = raw.trim();
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq <= 0) {
      errors.push(`malformed tag "${part}"`);
      continue;
    }
    const name = part.slice(0, eq).trim().toLowerCase();
    const val = part.slice(eq + 1).trim();
    if (tags.has(name)) errors.push(`tag "${name}" appears more than once`);
    tags.set(name, val);
    order.push(name);
  }
  return { tags, order, errors };
}

// ---------------------------------------------------------------------------
// DKIM
// ---------------------------------------------------------------------------

export interface DkimKeyRecord {
  keyType: string;
  publicKey: string;
  revoked: boolean;
  testing: boolean;
}

export function parseDkimRecord(record: string): ParseResult<DkimKeyRecord> {
  const { tags, order, errors } = parseTags(record);
  if (tags.has('v') && order[0] !== 'v') errors.push('"v=DKIM1" must be the first tag');
  if (tags.has('v') && tags.get('v') !== 'DKIM1') errors.push('version must be "DKIM1"');
  const keyType = (tags.get('k') ?? 'rsa').toLowerCase();
  if (!['rsa', 'ed25519'].includes(keyType)) errors.push(`unsupported key type "${keyType}"`);
  const p = (tags.get('p') ?? '').replace(/\s+/g, '');
  if (!tags.has('p')) errors.push('missing public key tag "p="');
  else if (p && !/^[A-Za-z0-9+/]+=*$/.test(p)) errors.push('public key is not valid base64');
  const value: DkimKeyRecord = {
    keyType,
    publicKey: p,
    revoked: tags.has('p') && p === '',
    testing: (tags.get('t') ?? '').split(':').includes('y'),
  };
  return { valid: errors.length === 0 && !value.revoked, errors, value };
}

// ---------------------------------------------------------------------------
// DMARC
// ---------------------------------------------------------------------------

export type DmarcPolicy = 'none' | 'quarantine' | 'reject';

export interface DmarcRecord {
  policy: DmarcPolicy | null;
  subdomainPolicy: DmarcPolicy | null;
  pct: number;
  adkim: 'r' | 's';
  aspf: 'r' | 's';
  rua: string[];
  ruf: string[];
}

const POLICIES = new Set(['none', 'quarantine', 'reject']);

export const isDmarcRecord = (txt: string): boolean => /^v\s*=\s*DMARC1\s*(;|$)/i.test(txt.trim());

export function parseDmarc(record: string): ParseResult<DmarcRecord> {
  const { tags, order, errors } = parseTags(record);
  if (order[0] !== 'v' || tags.get('v') !== 'DMARC1') errors.push('record must start with "v=DMARC1"');
  const p = tags.get('p')?.toLowerCase();
  if (!p) errors.push('missing required policy tag "p="');
  else if (!POLICIES.has(p)) errors.push(`invalid policy "p=${p}"`);
  const sp = tags.get('sp')?.toLowerCase();
  if (sp && !POLICIES.has(sp)) errors.push(`invalid subdomain policy "sp=${sp}"`);
  const pctRaw = tags.get('pct');
  const pct = pctRaw === undefined ? 100 : Number(pctRaw);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) errors.push('pct must be an integer between 0 and 100');
  const align = (name: 'adkim' | 'aspf'): 'r' | 's' => {
    const v = (tags.get(name) ?? 'r').toLowerCase();
    if (v !== 'r' && v !== 's') errors.push(`${name} must be "r" or "s"`);
    return v === 's' ? 's' : 'r';
  };
  const uris = (name: 'rua' | 'ruf') =>
    (tags.get(name) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const rua = uris('rua');
  for (const u of [...rua, ...uris('ruf')]) {
    if (!/^mailto:[^@\s]+@[^@\s]+$/i.test(u.replace(/!\d+[kmgt]?$/i, ''))) errors.push(`invalid report URI "${u}"`);
  }
  const value: DmarcRecord = {
    policy: p && POLICIES.has(p) ? (p as DmarcPolicy) : null,
    subdomainPolicy: sp && POLICIES.has(sp) ? (sp as DmarcPolicy) : null,
    pct: Number.isInteger(pct) ? pct : 100,
    adkim: align('adkim'),
    aspf: align('aspf'),
    rua,
    ruf: uris('ruf'),
  };
  return { valid: errors.length === 0, errors, value };
}
