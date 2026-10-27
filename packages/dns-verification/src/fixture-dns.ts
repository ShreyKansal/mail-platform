import type { DnsAnswer, DnsClient, DnsFailure, MxRecord } from './dns-client';

type Zone = Record<string, { TXT?: string[]; MX?: MxRecord[]; A?: string[]; fail?: DnsFailure }>;

/**
 * In-memory DNS for tests and for local development without public DNS.
 * Names are matched case-insensitively.
 */
export class FixtureDnsClient implements DnsClient {
  constructor(private readonly zone: Zone) {}

  private entry(name: string) {
    return this.zone[name.toLowerCase().replace(/\.$/, '')];
  }

  private answer<T>(name: string, pick: (e: NonNullable<Zone[string]>) => T[] | undefined): DnsAnswer<T[]> {
    const e = this.entry(name);
    if (!e) return { ok: false, failure: 'nxdomain', message: 'the name does not exist (NXDOMAIN)' };
    if (e.fail) return { ok: false, failure: e.fail, message: `fixture failure: ${e.fail}` };
    const records = pick(e);
    if (!records || records.length === 0) return { ok: false, failure: 'nodata', message: 'no records of this type' };
    return { ok: true, records };
  }

  async txt(name: string) {
    return this.answer(name, (e) => e.TXT);
  }

  async mx(name: string) {
    return this.answer(name, (e) => e.MX);
  }

  async raw(name: string, type: string): Promise<unknown> {
    const e = this.entry(name);
    const fail = (code: string) => Object.assign(new Error(code), { code });
    if (!e) throw fail('ENOTFOUND');
    if (e.fail === 'temporary') throw fail('ETIMEOUT');
    if (type === 'TXT' && e.TXT?.length) return e.TXT.map((t) => [t]);
    if (type === 'MX' && e.MX?.length) return e.MX;
    if (type === 'A' && e.A?.length) return e.A;
    throw fail('ENODATA');
  }
}
