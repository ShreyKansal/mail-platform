import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import compiled from '@compiled/vite-plugin';
import { libraryStyleOrder } from './build/libraryStyleOrder';
import { defineConfig, type ProxyOptions } from 'vite';

const api = process.env.API_ORIGIN ?? 'http://127.0.0.1:3000';
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const apiProxy: ProxyOptions = {
  target: api,
  configure(proxy) {
    proxy.on('error', (_error, _request, response) => {
      if (!('writeHead' in response) || response.headersSent) return;
      response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ error: {
        code: 'api_unavailable',
        message: 'The local API is not running or cannot be reached. Start the full stack with run-local.cmd, or run pnpm dev:api from mail-platform, then try again.',
      } }));
    });
  },
};

// The dev server proxies API paths so the session cookie stays first-party.
// The guides centre reads Markdown from the repository's docs/ folder.
export default defineConfig({
  plugins: [
    tailwindcss(),
    libraryStyleOrder(),
    compiled({ extract: true, sortShorthand: true, sortAtRules: true }),
    react(),
  ],
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [repoRoot] },
    proxy: {
      '/v1': apiProxy,
      '/auth': apiProxy,
      '/docs': apiProxy,
    },
  },
  build: { sourcemap: true, chunkSizeWarningLimit: 2500 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
    setupFiles: ['src/test-setup.ts'],
  },
} as Parameters<typeof defineConfig>[0]);
