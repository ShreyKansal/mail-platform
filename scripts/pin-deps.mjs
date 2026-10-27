#!/usr/bin/env node
// Rewrites every workspace package.json so dependency ranges become the exact
// versions currently installed (the spec requires version-pinned components).
// Run after adding dependencies: `node scripts/pin-deps.mjs && pnpm install`.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dirs = ['.', ...['apps', 'services', 'packages'].flatMap((g) => readdirSync(join(root, g)).map((d) => join(g, d))), 'tests'];

let changed = 0;
for (const dir of dirs) {
  const file = join(root, dir, 'package.json');
  if (!existsSync(file)) continue;
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  const req = createRequire(join(root, dir, 'noop.js'));
  for (const field of ['dependencies', 'devDependencies']) {
    for (const [name, range] of Object.entries(pkg[field] ?? {})) {
      if (range.startsWith('workspace:') || /^\d+\.\d+\.\d+$/.test(range)) continue;
      let version;
      try {
        version = JSON.parse(readFileSync(req.resolve(`${name}/package.json`), 'utf8')).version;
      } catch {
        // Packages that hide package.json behind "exports": walk node_modules directly.
        const p = join(root, dir, 'node_modules', name, 'package.json');
        if (existsSync(p)) version = JSON.parse(readFileSync(p, 'utf8')).version;
      }
      if (!version) throw new Error(`cannot resolve installed version of ${name} in ${dir}`);
      pkg[field][name] = version;
      changed += 1;
    }
  }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}
console.log(`pinned ${changed} dependency ranges`);
