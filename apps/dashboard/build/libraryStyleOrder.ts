import type { Plugin } from 'vite';
import { sort } from '@compiled/css';

/** Keep pre-extracted library atoms in one ordered development sheet, as in production. */
export function libraryStyleOrder(): Plugin {
  const sheets = new Map<string, string>();
  let cached = '';
  let dirty = true;
  const cssPath = '/@ads-library-order.css';
  const runtimePath = '/@ads-library-order.js';
  return {
    name: 'ads-library-css-order',
    enforce: 'pre',
    apply: 'serve',
    transform(code, id) {
      const file = id.split('?')[0]!;
      if (!file.endsWith('.compiled.css')) return;
      if (sheets.get(file) !== code) { sheets.set(file, code); dirty = true; }
    },
    transformIndexHtml() {
      return [{ tag: 'script', attrs: { type: 'module', src: runtimePath }, injectTo: 'head' }];
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0];
        if (path === cssPath) {
          if (dirty) {
            cached = sort([...sheets].sort(([a], [b]) => a.localeCompare(b)).map(([, css]) => css).join('\n'), { sortShorthandEnabled: true, sortAtRulesEnabled: true });
            dirty = false;
          }
          response.writeHead(200, { 'content-type': 'text/css', 'cache-control': 'no-store' });
          response.end(cached);
          return;
        }
        if (path === runtimePath) {
          response.writeHead(200, { 'content-type': 'application/javascript', 'cache-control': 'no-store' });
          response.end(`
            let timer, revision = 0;
            const relevant = node => node instanceof Element && node.matches('style[data-vite-dev-id]') && node.getAttribute('data-vite-dev-id').includes('.compiled.css');
            async function refresh() {
              const current = ++revision;
              const response = await fetch('${cssPath}', { cache: 'no-store' });
              if (!response.ok) return;
              const css = await response.text();
              if (current !== revision) return;
              let sheet = document.getElementById('ads-library-order');
              if (!sheet) { sheet = document.createElement('style'); sheet.id = 'ads-library-order'; }
              sheet.textContent = css;
              document.head.appendChild(sheet);
              sheet.dataset.ready = 'true';
            }
            const schedule = () => { clearTimeout(timer); timer = setTimeout(() => refresh().catch(console.error), 25); };
            new MutationObserver(changes => {
              if (changes.some(change => relevant(change.target) || relevant(change.target.parentElement) || [...change.addedNodes].some(relevant))) schedule();
            }).observe(document.head, { childList: true, subtree: true, characterData: true });
            schedule();
          `);
          return;
        }
        next();
      });
    },
  };
}
