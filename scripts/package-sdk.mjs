import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageDir = resolve(root, 'packages/morphmailer');
const output = resolve(root, 'apps/dashboard/public/downloads');
const { version } = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
mkdirSync(output, { recursive: true });
// Fixed commands/arguments only. npm packs the built ESM, CJS and declaration files.
const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd pack --ignore-scripts --json'] : ['pack', '--ignore-scripts', '--json'];
const result = JSON.parse(execFileSync(command, args, { cwd: packageDir, encoding: 'utf8', windowsHide: true }));
const archive = result[0].filename;
copyFileSync(resolve(packageDir, archive), resolve(output, `morphmailer-${version}.tgz`));
console.log(`SDK available at /downloads/morphmailer-${version}.tgz`);
