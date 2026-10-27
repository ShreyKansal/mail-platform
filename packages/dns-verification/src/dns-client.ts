import { Resolver } from 'node:dns/promises';
import { isIPv4 } from 'node:net';

export type DnsFailure = 'nxdomain' | 'nodata' | 'temporary' | 'error';

export type DnsAnswer<T> = { ok: true; records: T } | { ok: false; failure: DnsFailure; message: string };

export interface MxRecord {
  exchange: string;
  priority: number;
}

/** The subset of DNS the verifier needs; injectable for tests and fixtures. */
export interface DnsClient {
  /** TXT records, each with its character-strings joined. */
  txt(name: string): Promise<DnsAnswer<string[]>>;
  mx(name: string): Promise<DnsAnswer<MxRecord[]>>;
  /** Generic resolver in the shape mailauth expects (for SPF evaluation). */
  raw(name: string, type: string): Promise<unknown>;
}

function toFailure(err: unknown): { ok: false; failure: DnsFailure; message: string } {
  const code = (err as { code?: string }).code ?? '';
  const message = (err as Error).message ?? String(err);
  if (code === 'ENOTFOUND') return { ok: false, failure: 'nxdomain', message: 'the name does not exist (NXDOMAIN)' };
  if (code === 'ENODATA') return { ok: false, failure: 'nodata', message: 'no records of this type' };
  if (['ETIMEOUT', 'ESERVFAIL', 'ECONNREFUSED', 'EREFUSED', 'ETIMEDOUT', 'ECANCELLED'].includes(code)) {
    return { ok: false, failure: 'temporary', message: `temporary DNS failure (${code})` };
  }
  return { ok: false, failure: 'error', message: `DNS error (${code || message})` };
}

export class NodeDnsClient implements DnsClient {
  private readonly resolver: Resolver;

  constructor(servers?: string[], timeoutMs = 3000) {
    this.resolver = new Resolver({ timeout: timeoutMs, tries: 2 });
    if (servers?.length) this.resolver.setServers(servers);
  }

  async txt(name: string): Promise<DnsAnswer<string[]>> {
    try {
      const rr = await this.resolver.resolveTxt(name);
      return { ok: true, records: rr.map((chunks) => chunks.join('')) };
    } catch (err) {
      return toFailure(err);
    }
  }

  async mx(name: string): Promise<DnsAnswer<MxRecord[]>> {
    try {
      const rr = await this.resolver.resolveMx(name);
      return { ok: true, records: rr.map((r) => ({ exchange: r.exchange.toLowerCase().replace(/\.$/, ''), priority: r.priority })) };
    } catch (err) {
      return toFailure(err);
    }
  }

  raw(name: string, type: string): Promise<unknown> {
    return this.resolver.resolve(name, type);
  }
}

/**
 * Finds the authoritative nameservers for `name` by walking up the labels
 * until an NS RRset is found, then returns a client that queries them
 * directly. Used to tell "not published" apart from "published, still propagating".
 */
export async function authoritativeClient(name: string, recursive = new Resolver({ timeout: 3000, tries: 2 })): Promise<DnsClient | null> {
  const labels = name.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    const zone = labels.slice(i).join('.');
    let ns: string[];
    try {
      ns = await recursive.resolveNs(zone);
    } catch {
      continue;
    }
    const ips: string[] = [];
    for (const host of ns.slice(0, 4)) {
      try {
        ips.push(...(await recursive.resolve4(host)).filter((ip) => isIPv4(ip)));
      } catch {
        // try the next nameserver
      }
    }
    return ips.length ? new NodeDnsClient(ips.slice(0, 4)) : null;
  }
  return null;
}
