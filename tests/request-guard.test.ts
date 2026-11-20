import { describe, expect, test } from 'bun:test';
import { createHandler } from '../server/http';
import type { SetupState } from '../server/config';

const setup: SetupState = {
  state: 'unconfigured',
  error: {
    code: 'CONFIGURATION_ERROR',
    message: 'Not configured.',
    retryable: false,
  },
};

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
  const production = createHandler({ mode: 'production', setup });
  const development = createHandler({ mode: 'development', setup });

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
    const response = await production(request(headers));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: 'FORBIDDEN',
        message: 'Only requests from this local workspace are allowed.',
        retryable: false,
      },
    });
  });

  test('rejects a missing Host and a non-local request URL', async () => {
    expect(
      (await production(new Request('http://127.0.0.1:3001/api/status')))
        .status,
    ).toBe(403);
    expect(
      (
        await production(
          new Request('http://evil.example/api/status', {
            headers: { Host: '127.0.0.1:3001' },
          }),
        )
      ).status,
    ).toBe(403);
  });

  test.each([
    {},
    { 'Sec-Fetch-Site': 'same-origin' },
    { 'Sec-Fetch-Site': 'none' },
  ])(
    'allows local CLI and same-origin requests through to routing: %j',
    async (headers) => {
      expect((await production(request(headers))).status).toBe(404);
    },
  );

  test('preserves development proxy Host and Origin validation', async () => {
    const proxied = new Request('http://127.0.0.1:5173/api/unknown', {
      headers: {
        Host: '127.0.0.1:5173',
        Origin: 'http://127.0.0.1:5173',
        'Sec-Fetch-Site': 'same-origin',
      },
    });
    expect((await development(proxied)).status).toBe(404);
    expect((await production(proxied)).status).toBe(403);
    expect(
      (await development(request({ Origin: 'https://evil.example' }))).status,
    ).toBe(403);
  });

  test.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])(
    'rejects %s without dispatching a mutation',
    async (method) => {
      const response = await production(request({}, method));
      expect(response.status).toBe(405);
      expect(response.headers.get('Allow')).toBe('GET');
    },
  );

  test('does not use forwarded headers to trust a foreign request', async () => {
    expect(
      (
        await development(
          request({
            Host: 'evil.example',
            'X-Forwarded-Host': '127.0.0.1:5173',
            'X-Forwarded-For': '127.0.0.1',
          }),
        )
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
      const response = await production(input);
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
