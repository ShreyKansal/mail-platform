import { readFileSync } from 'node:fs';
import { authoritativeClient, FixtureDnsClient, NodeDnsClient, type VerifyContext } from '@mp/dns-verification';
import type { CoreConfig } from '@mp/core';

/**
 * Builds the DNS context for domain verification. In development a fixture
 * zone file may stand in for public DNS (config validation forbids it in
 * production); it is re-read on every check so edits apply immediately.
 */
export function createDnsContext(core: CoreConfig, opts: { servers: string[]; fixtureFile?: string | undefined }): VerifyContext {
  if (opts.fixtureFile) {
    const file = opts.fixtureFile;
    const load = () => new FixtureDnsClient(JSON.parse(readFileSync(file, 'utf8')));
    return {
      platform: core.platform,
      dns: {
        txt: (n) => load().txt(n),
        mx: (n) => load().mx(n),
        raw: (n, t) => load().raw(n, t),
      },
    };
  }
  return {
    platform: core.platform,
    dns: new NodeDnsClient(opts.servers),
    authoritative: (host) => authoritativeClient(host),
  };
}
