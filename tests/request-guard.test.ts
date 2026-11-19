import { describe, expect, test } from 'bun:test';
import { createHandler } from '../server/http';

function request(
  headers: Record<string, string> = {},
  method = 'GET',
  path = '/api/unknown',
) {
  return new Request(`http://127.0.0.1:3001${path}`, {
    method,
    headers: { Host: '127.0.0.1:3001', ...headers },
  });
}

describe('local request boundary', () => {
  const production = createHandler({ mode: 'production' });
  const development = createHandler({ mode: 'development' });

  test.each([
    { Host: 'evil.example' },
    { Host: '127.0.0.1:3002' },
    { Host: 'localhost.evil.example:3001' },
    { Origin: 'https://evil.example' },
    { Origin: 'null' },
    { Origin: 'http://127.0.0.1:3001.evil.example' },
    { 'Sec-Fetch-Site': 'cross-site' },
    { 'Sec-Fetch-Site': 'same-site' },
    { 'Sec-Fetch-Site': 'unknown' },
    { Origin: 'http://127.0.0.1:3001', 'Sec-Fetch-Site': 'cross-site' },
  ])('rejects foreign request context %j before routing', async (headers) => {
    const response = production(request(headers));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Only requests from this local workspace are allowed.',
        retryable: false,
      },
    });
  });

  test('rejects a missing Host and a non-local request URL', () => {
    expect(
      production(new Request('http://127.0.0.1:3001/api/status')).status,
    ).toBe(403);
    expect(
      production(
        new Request('http://evil.example/api/status', {
          headers: { Host: '127.0.0.1:3001' },
        }),
      ).status,
    ).toBe(403);
  });

  test.each([
    {},
    { 'Sec-Fetch-Site': 'same-origin' },
    { 'Sec-Fetch-Site': 'none' },
  ])(
    'allows local CLI and same-origin requests through to routing: %j',
    (headers) => {
      expect(production(request(headers)).status).toBe(404);
    },
  );

  test('preserves development proxy Host and Origin validation', () => {
    const proxied = new Request('http://127.0.0.1:5173/api/unknown', {
      headers: {
        Host: '127.0.0.1:5173',
        Origin: 'http://127.0.0.1:5173',
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    expect(development(proxied).status).toBe(404);
    expect(production(proxied).status).toBe(403);
    expect(
      development(request({ Origin: 'https://evil.example' })).status,
    ).toBe(403);
  });

  test.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])(
    'rejects %s without dispatching a mutation',
    (method) => {
      const response = production(request({}, method));
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET');
    },
  );

  test('does not use forwarded headers to trust a foreign request', () => {
    expect(
      development(
        request({
          Host: 'evil.example',
          'X-Forwarded-Host': '127.0.0.1:5173',
          'X-Forwarded-For': '127.0.0.1',
        }),
      ).status,
    ).toBe(403);
  });

  test.each([
    request(),
    request({ Origin: 'https://evil.example' }),
    request({}, 'POST'),
  ])(
    'returns sanitized, non-cacheable JSON without CORS permission',
    async (input) => {
      const response = production(input);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Content-Type')).toContain(
        'application/json',
      );
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
      expect(await response.text()).not.toContain('stack');
    },
  );
});
