import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cssVariables } from '../apps/dashboard/src/design/frappe/tokens.js';

export function renderTokens() {
  const declarations = values => Object.entries(values).map(([name, value]) => `  ${name}: ${value};`).join('\n');
  return `/* Generated from frappe-ui@1.0.0-rc.2. MIT; see design/frappe/LICENSE.md.\n * Run node scripts/sync-frappe-tokens.mjs to regenerate. */\n:root:root:root:root:root {\n${declarations(cssVariables.light)}\n}\nhtml[data-color-mode="dark"]:root:root:root:root:root {\n${declarations(cssVariables.dark)}\n}\n`;
}
const target = fileURLToPath(new URL('../apps/dashboard/src/frappe-tokens.css', import.meta.url));
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== renderTokens()) throw new Error('Frappe tokens differ from the pinned source. Regenerate with scripts/sync-frappe-tokens.mjs.');
  console.log('Exact Frappe UI theme token parity verified.');
} else {
  writeFileSync(target, renderTokens());
  console.log('Frappe UI tokens synchronized.');
}
