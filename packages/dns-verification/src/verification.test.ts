import { describe, expect, it } from 'vitest';
import {
  checkRecord,
  expectedRecords,
  FixtureDnsClient,
  parseDkimRecord,
  parseDmarc,
  parseSpf,
  type VerifyContext,
} from './index';

const platform = { spfInclude: '_spf.mail-platform.test', bounceMxHost: 'feedback.mail-platform.test', outboundIps: [] };
const dkimValue = 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtest';

const expected = expectedRecords({
  domain: 'notify.example.com',
  ownershipToken: 'tok123',
  dkimSelector: 'mp20261021abcdef',
  dkimTxtValue: dkimValue,
  returnPathLabel: 'bounce',
  platform,
});
const rec = (purpose: string) => expected.find((r) => r.purpose === purpose)!;
const ctx = (zone: ConstructorParameters<typeof FixtureDnsClient>[0], extra: Partial<VerifyContext> = {}): VerifyContext => ({
  dns: new FixtureDnsClient(zone),
  platform,
  ...extra,
});

describe('expected records', () => {
  it('generates hosts relative to the sending domain and DMARC at the organizational domain', () => {
    expect(expected.map((r) => [r.purpose, r.type, r.host, r.required])).toEqual([
      ['ownership', 'TXT', '_mp-challenge.notify.example.com', true],
      ['dkim', 'TXT', 'mp20261021abcdef._domainkey.notify.example.com', true],
      ['return_path_mx', 'MX', 'bounce.notify.example.com', false],
      ['return_path_spf', 'TXT', 'bounce.notify.example.com', false],
      ['dmarc', 'TXT', '_dmarc.example.com', false],
    ]);
    expect(rec('ownership').value).toBe('mp-verification=tok123');
  });
});

describe('record checks', () => {
  it('ownership: valid, wrong token, missing, temporary failure', async () => {
    const host = '_mp-challenge.notify.example.com';
    expect((await checkRecord(rec('ownership'), ctx({ [host]: { TXT: ['other', 'mp-verification=tok123'] } }))).status).toBe('valid');
    expect((await checkRecord(rec('ownership'), ctx({ [host]: { TXT: ['mp-verification=someone-else'] } }))).status).toBe('invalid');
    expect((await checkRecord(rec('ownership'), ctx({}))).status).toBe('missing');
    expect((await checkRecord(rec('ownership'), ctx({ [host]: { fail: 'temporary' } }))).status).toBe('temp_error');
    expect((await checkRecord(rec('ownership'), ctx({ [host]: { fail: 'error' } }))).status).toBe('resolution_failed');
  });

  it('reports propagation when only the authoritative servers have the record', async () => {
    const host = '_mp-challenge.notify.example.com';
    const result = await checkRecord(
      rec('ownership'),
      ctx({}, { authoritative: async () => new FixtureDnsClient({ [host]: { TXT: ['mp-verification=tok123'] } }) }),
    );
    expect(result.status).toBe('pending');
  });

  it('dkim: matching key, mismatched key, duplicate records', async () => {
    const host = rec('dkim').host;
    expect((await checkRecord(rec('dkim'), ctx({ [host]: { TXT: [dkimValue] } }))).status).toBe('valid');
    expect((await checkRecord(rec('dkim'), ctx({ [host]: { TXT: ['v=DKIM1; k=rsa; p=MIIBother'] } }))).status).toBe('invalid');
    expect((await checkRecord(rec('dkim'), ctx({ [host]: { TXT: [dkimValue, dkimValue] } }))).status).toBe('conflict');
    expect((await checkRecord(rec('dkim'), ctx({ [host]: { TXT: ['v=DKIM1; p='] } }))).status).toBe('invalid');
  });

  it('return-path MX: exact, extra hosts, wrong host', async () => {
    const host = 'bounce.notify.example.com';
    const mx = (exchange: string, priority = 10) => ({ exchange, priority });
    expect((await checkRecord(rec('return_path_mx'), ctx({ [host]: { MX: [mx('feedback.mail-platform.test')] } }))).status).toBe('valid');
    expect(
      (await checkRecord(rec('return_path_mx'), ctx({ [host]: { MX: [mx('feedback.mail-platform.test'), mx('mx.other.com', 20)] } }))).status,
    ).toBe('conflict');
    expect((await checkRecord(rec('return_path_mx'), ctx({ [host]: { MX: [mx('mx.other.com')] } }))).status).toBe('invalid');
  });

  it('return-path SPF: include matching, multiple records, syntax errors', async () => {
    const host = 'bounce.notify.example.com';
    expect(
      (await checkRecord(rec('return_path_spf'), ctx({ [host]: { TXT: ['v=spf1 include:_spf.mail-platform.test -all'] } }))).status,
    ).toBe('valid');
    expect((await checkRecord(rec('return_path_spf'), ctx({ [host]: { TXT: ['v=spf1 -all', 'v=spf1 ~all'] } }))).status).toBe('conflict');
    expect((await checkRecord(rec('return_path_spf'), ctx({ [host]: { TXT: ['v=spf1 include:_spf.google.com ~all'] } }))).status).toBe('invalid');
    expect((await checkRecord(rec('return_path_spf'), ctx({ [host]: { TXT: ['v=spf1 bogus:x -all'] } }))).status).toBe('invalid');
  });

  it('return-path SPF: evaluates real authorization when outbound IPs are configured', async () => {
    const host = 'bounce.notify.example.com';
    const zone = {
      [host]: { TXT: ['v=spf1 include:_spf.mail-platform.test -all'] },
      '_spf.mail-platform.test': { TXT: ['v=spf1 ip4:203.0.113.10 ip4:203.0.113.11 -all'] },
    };
    const withIps = (ips: string[]): VerifyContext => ({ ...ctx(zone), platform: { ...platform, outboundIps: ips } });
    expect((await checkRecord(rec('return_path_spf'), withIps(['203.0.113.10', '203.0.113.11']))).status).toBe('valid');
    const partial = await checkRecord(rec('return_path_spf'), withIps(['203.0.113.10', '198.51.100.7']));
    expect(partial.status).toBe('invalid');
    expect(partial.detail).toContain('198.51.100.7');
  });

  it('dmarc: enforcement, monitoring only, partial pct, missing', async () => {
    const host = '_dmarc.example.com';
    expect((await checkRecord(rec('dmarc'), ctx({ [host]: { TXT: ['v=DMARC1; p=reject; rua=mailto:d@example.com'] } }))).status).toBe('valid');
    expect((await checkRecord(rec('dmarc'), ctx({ [host]: { TXT: ['v=DMARC1; p=none'] } }))).status).toBe('partial');
    expect((await checkRecord(rec('dmarc'), ctx({ [host]: { TXT: ['v=DMARC1; p=quarantine; pct=50'] } }))).status).toBe('partial');
    expect((await checkRecord(rec('dmarc'), ctx({}))).status).toBe('missing');
  });
});

describe('parsers', () => {
  it('SPF', () => {
    expect(parseSpf('v=spf1 ip4:192.0.2.0/24 include:_spf.example.com ~all')).toMatchObject({
      valid: true,
      value: { all: '~', includes: ['_spf.example.com'], directLookups: 1 },
    });
    expect(parseSpf('v=spf1 +all').valid).toBe(false);
    expect(parseSpf('v=spf1 ip4:999.1.1.1 -all').valid).toBe(false);
    const many = `v=spf1 ${Array.from({ length: 11 }, (_, i) => `include:s${i}.example.com`).join(' ')} -all`;
    expect(parseSpf(many).errors.join()).toContain('limit is 10');
  });

  it('DKIM', () => {
    expect(parseDkimRecord('v=DKIM1; k=rsa; p=QUJD').valid).toBe(true);
    expect(parseDkimRecord('k=rsa; v=DKIM1; p=QUJD').valid).toBe(false);
    expect(parseDkimRecord('v=DKIM1; k=dsa; p=QUJD').valid).toBe(false);
    expect(parseDkimRecord('v=DKIM1; p=').value.revoked).toBe(true);
  });

  it('DMARC', () => {
    expect(parseDmarc('v=DMARC1; p=quarantine; sp=reject; pct=100; adkim=s; rua=mailto:a@b.com')).toMatchObject({
      valid: true,
      value: { policy: 'quarantine', subdomainPolicy: 'reject', pct: 100, adkim: 's', aspf: 'r' },
    });
    expect(parseDmarc('p=reject; v=DMARC1').valid).toBe(false);
    expect(parseDmarc('v=DMARC1; p=block').valid).toBe(false);
    expect(parseDmarc('v=DMARC1; p=none; pct=150').valid).toBe(false);
    expect(parseDmarc('v=DMARC1; p=none; rua=https://x').valid).toBe(false);
  });
});
