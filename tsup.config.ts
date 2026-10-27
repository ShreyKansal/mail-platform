import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

// Production bundles: workspace packages (@mp/*) are inlined because they ship
// TypeScript sources; every third-party dependency of any workspace package
// stays external and is resolved from the flat (hoisted) node_modules in the
// runtime image. Bundling those would break packages that use require() of
// Node built-ins or read their own files (pino, swagger-ui, …).
const root = dirname(fileURLToPath(import.meta.url));
const thirdParty = new Set<string>();
for (const group of ['apps', 'services', 'packages']) {
  for (const dir of readdirSync(join(root, group))) {
    const file = join(root, group, dir, 'package.json');
    if (!existsSync(file)) continue;
    const pkg = JSON.parse(readFileSync(file, 'utf8')) as { dependencies?: Record<string, string> };
    for (const name of Object.keys(pkg.dependencies ?? {})) if (!name.startsWith('@mp/')) thirdParty.add(name);
  }
}

export default defineConfig({
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  noExternal: [/^@mp\//],
  external: [...thirdParty],
  splitting: false,
  sourcemap: true,
  clean: true,
});
