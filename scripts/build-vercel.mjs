import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export function deploymentConfig(apiOrigin) {
  if (!apiOrigin) throw new Error('Set API_ORIGIN to the public HTTPS URL of the deployed mailer backend. localhost cannot be reached from Vercel.');
  const api = new URL(apiOrigin);
  if (api.protocol !== 'https:' || api.username || api.password || api.pathname !== '/' || api.search || api.hash || /^(localhost|127\.|0\.|\[|.*\.localhost$)/i.test(api.hostname)) {
    throw new Error('API_ORIGIN must be a public HTTPS origin, without credentials, a path, query or fragment.');
  }
  return {
    version: 3,
    routes: [
      // Keep session cookies first-party; API requests must never fall through to index.html.
      ...['auth', 'v1', 'docs'].map(prefix => ({ src: `/${prefix}(/.*)?`, dest: `${api.origin}/${prefix}$1`, headers: { 'cache-control': 'private, no-store' } })),
      { handle: 'filesystem' },
      { src: '/assets/.*', status: 404 },
      { src: '/.*', dest: '/index.html', headers: { 'cache-control': 'no-cache' } },
    ],
  };
}

function removeSourceMaps(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) removeSourceMaps(path);
    else if (entry.name.endsWith('.map')) rmSync(path);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = deploymentConfig(process.env.API_ORIGIN);
  const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm.cmd --filter @mp/dashboard build'] : ['--filter', '@mp/dashboard', 'build'];
  execFileSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  const output = resolve(root, '.vercel/output');
  const outputRelative = relative(root, output);
  if (isAbsolute(outputRelative) || outputRelative.startsWith('..') || outputRelative !== '.vercel/output' && outputRelative !== '.vercel\\output') throw new Error('Invalid deployment output path');
  if (existsSync(output)) rmSync(output, { recursive: true });
  mkdirSync(output, { recursive: true });
  cpSync(resolve(root, 'apps/dashboard/dist'), resolve(output, 'static'), { recursive: true });
  removeSourceMaps(resolve(output, 'static'));
  writeFileSync(resolve(output, 'config.json'), JSON.stringify(config, null, 2) + '\n');
  console.log('Vercel build output prepared with backend proxy routes and SPA navigation.');
}
