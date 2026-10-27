import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { and, createServiceDatabase, dkimKeys, dnsRecords, domains, eq, inArray } from '@mp/database';
import { dkimTxtValue } from '@mp/mail-protocol';

/**
 * Development helper: copies the DNS records the platform generated for a
 * domain into the local fixture zone (DNS_FIXTURE_FILE), simulating the
 * customer publishing them at their DNS provider.
 *
 *   pnpm --filter @mp/api dev:publish-dns example.com [--dmarc "v=DMARC1; p=reject"]
 */
const [name, flag, dmarcArg] = process.argv.slice(2);
const file = process.env.DNS_FIXTURE_FILE;
const url = process.env.DATABASE_SERVICE_URL;
if (process.env.NODE_ENV === 'production') throw new Error('refusing to run in production');
if (!name || !file || !url) {
  console.error('usage: dev:publish-dns <domain> [--dmarc "<record>"]  (needs DNS_FIXTURE_FILE and DATABASE_SERVICE_URL)');
  process.exit(1);
}

type Zone = Record<string, { TXT?: string[]; MX?: Array<{ exchange: string; priority: number }> }>;
const zone: Zone = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Zone) : {};
const { db, close } = createServiceDatabase(url, 'publish-dns', 1);
try {
  const rows = await db
    .select({ purpose: dnsRecords.purpose, type: dnsRecords.type, host: dnsRecords.host, value: dnsRecords.value, priority: dnsRecords.priority })
    .from(dnsRecords)
    .innerJoin(domains, eq(domains.id, dnsRecords.domainId))
    .where(eq(domains.name, name.toLowerCase()));
  if (rows.length === 0) throw new Error(`no domain named ${name}`);
  for (const r of rows) {
    if (r.type === 'MX') zone[r.host] = { ...zone[r.host], MX: [{ exchange: r.value, priority: r.priority ?? 10 }] };
    else {
      const value = r.purpose === 'dmarc' ? (flag === '--dmarc' && dmarcArg ? dmarcArg : 'v=DMARC1; p=quarantine') : r.value;
      const existing = (zone[r.host]?.TXT ?? []).filter((t) => (r.purpose === 'dmarc' ? !t.startsWith('v=DMARC1') : t !== value));
      zone[r.host] = { ...zone[r.host], TXT: [...existing, value] };
    }
    console.log(`published ${r.type.padEnd(3)} ${r.host}`);
  }
  const rotationKeys = await db.select({ selector: dkimKeys.selector, publicKey: dkimKeys.publicKey }).from(dkimKeys).innerJoin(domains, eq(domains.id, dkimKeys.domainId))
    .where(and(eq(domains.name, name.toLowerCase()), inArray(dkimKeys.status, ['pending', 'active', 'retiring'])));
  for (const key of rotationKeys) {
    const host = `${key.selector}._domainkey.${name.toLowerCase()}`;
    zone[host] = { ...zone[host], TXT: [dkimTxtValue(key.publicKey)] };
    console.log(`published TXT ${host}`);
  }
  writeFileSync(file, `${JSON.stringify(zone, null, 2)}\n`);
} finally {
  await close();
}
