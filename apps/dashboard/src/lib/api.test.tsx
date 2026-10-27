import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('API availability errors', () => {
  it('preserves the actionable development proxy error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'api_unavailable', message: 'Start the local API, then try again.' } }), { status: 503 })));
    await expect(api.get('/auth/session')).rejects.toMatchObject({ status: 503, body: { code: 'api_unavailable' }, message: 'Start the local API, then try again.' });
  });

  it('reports non-JSON upstream failures as API errors instead of syntax errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502, headers: { 'x-request-id': 'req_test' } })));
    await expect(api.get('/auth/session')).rejects.toMatchObject({ status: 502, body: { code: 'invalid_response' }, requestId: 'req_test' });
  });

  it('still reports connection failures as actionable API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(api.get('/auth/session')).rejects.toBeInstanceOf(ApiError);
  });
});
