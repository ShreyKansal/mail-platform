import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentConfig } from './build-vercel.mjs';

test('requires a public HTTPS backend before a deployment can be built', () => {
  for (const value of [undefined, 'http://api.example.com', 'https://localhost', 'https://127.0.0.1', 'https://api.example.com/path', 'https://user:password@api.example.com']) {
    assert.throws(() => deploymentConfig(value));
  }
});

test('proxies authentication before SPA fallback without caching private API data', () => {
  const { version, routes } = deploymentConfig('https://api.example.com');
  assert.equal(version, 3);
  for (const prefix of ['auth', 'v1', 'docs']) {
    const route = routes.find(route => route.src === `/${prefix}(/.*)?`);
    assert.equal(route.dest, `https://api.example.com/${prefix}$1`);
    assert.equal(route.headers['cache-control'], 'private, no-store');
  }
  assert.deepEqual(routes[3], { handle: 'filesystem' });
  assert.equal(routes.at(-1).dest, '/index.html');
});
