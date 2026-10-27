#!/usr/bin/env node
// Creates .env from .env.example, generating fresh secrets for every <generate>
// placeholder. Refuses to overwrite an existing .env.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, '.env');
if (existsSync(target)) {
  console.error('.env already exists; remove it first if you want to regenerate secrets.');
  process.exit(1);
}

const generators = {
  ENCRYPTION_KEYS: () => `dev1:${randomBytes(32).toString('base64')}`,
  VERP_SECRET: () => randomBytes(32).toString('base64url'),
};

const out = readFileSync(join(root, '.env.example'), 'utf8').replace(/^([A-Z0-9_]+)=<generate>$/gm, (_, name) => {
  const gen = generators[name];
  if (!gen) throw new Error(`no generator for ${name}`);
  return `${name}=${gen()}`;
});
writeFileSync(target, out, { mode: 0o600 });

mkdirSync(join(root, '.data', 'postfix-log'), { recursive: true });
const fixture = join(root, '.data', 'dns-fixture.json');
if (!existsSync(fixture)) writeFileSync(fixture, '{}\n');
console.log('wrote .env and .data/dns-fixture.json');
