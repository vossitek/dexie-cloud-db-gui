import { describe, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { AuthenticationError, createTokenProvider } from '../server/auth';
import type { ErrorCode } from '../shared/contracts';

const config = {
  databaseUrl: 'https://example-db.dexie.cloud',
  clientId: 'fixture-client',
  clientSecret: 'fixture-secret',
};
const initialTime = 1_800_000_000_000;

async function expectFailure(
  promise: Promise<string>,
  code: ErrorCode,
  retryable: boolean,
) {
  await rejects(promise, (error: unknown) => {
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error).toMatchObject({ error: { code, retryable } });
    expect(String(error)).not.toContain('fixture-');
    expect(JSON.stringify(error)).not.toContain('fixture-');
    return true;
  });
}

function tokenResponse(
  accessToken = 'fixture-token',
  expiration = initialTime + 3_600_000,
) {
  return Response.json({
    type: 'tokens',
    accessToken,
    accessTokenExpiration: expiration,
  });
}

describe('read-only token provider', () => {
  test('requests only the approved scopes, keeps credentials out of the URL, and refuses redirects', async () => {
    const requests: Request[] = [];
    const provider = createTokenProvider(config, {
      now: () => initialTime,
      fetch: (url, init) => {
        requests.push(new Request(url, init));
        return Promise.resolve(tokenResponse());
      },
    });
    expect(await provider.getToken()).toBe('fixture-token');
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toBe(`${config.databaseUrl}/token`);
    expect(request.method).toBe('POST');
    expect(request.redirect).toBe('manual');
    expect(request.headers.get('Content-Type')).toBe('application/json');
    expect(await request.json()).toEqual({
      grant_type: 'client_credentials',
      scopes: ['ACCESS_DB', 'GLOBAL_READ'],
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
  });

  test('reuses a token until its millisecond expiry and coalesces simultaneous renewals', async () => {
    let time = initialTime;
    let calls = 0;
    const provider = createTokenProvider(config, {
      now: () => time,
      fetch: () =>
        Promise.resolve(tokenResponse(`token-${++calls}`, time + 1000)),
    });
    expect(
      await Promise.all([provider.getToken(), provider.getToken()]),
    ).toEqual(['token-1', 'token-1']);
    time += 999;
    expect(await provider.getToken()).toBe('token-1');
    expect(calls).toBe(1);
    time++;
    expect(
      await Promise.all([
        provider.getToken(),
        provider.getToken(),
        provider.getToken(),
      ]),
    ).toEqual(['token-2', 'token-2', 'token-2']);
    expect(calls).toBe(2);
  });

  test('invalidates only the rejected token so a late failure cannot discard its replacement', async () => {
    let calls = 0;
    const provider = createTokenProvider(config, {
      now: () => initialTime,
      fetch: () => Promise.resolve(tokenResponse(`token-${++calls}`)),
    });
    expect(await provider.getToken()).toBe('token-1');
    provider.invalidate('token-1');
    expect(
      await Promise.all([provider.getToken(), provider.getToken()]),
    ).toEqual(['token-2', 'token-2']);
    provider.invalidate('token-1');
    expect(await provider.getToken()).toBe('token-2');
    expect(calls).toBe(2);
  });

  test('does not share cached tokens across configured databases', async () => {
    const first = createTokenProvider(config, {
      now: () => initialTime,
      fetch: () => Promise.resolve(tokenResponse('first')),
    });
    const second = createTokenProvider(
      { ...config, databaseUrl: 'https://other-db.dexie.cloud' },
      {
        now: () => initialTime,
        fetch: () => Promise.resolve(tokenResponse('second')),
      },
    );
    expect(await first.getToken()).toBe('first');
    expect(await second.getToken()).toBe('second');
  });

  test.each(
    [
      null,
      [],
      {},
      {
        type: 'error',
        accessToken: 'fixture-token',
        accessTokenExpiration: initialTime + 1000,
      },
      {
        type: 'tokens',
        accessToken: '',
        accessTokenExpiration: initialTime + 1000,
      },
      {
        type: 'tokens',
        accessToken: 42,
        accessTokenExpiration: initialTime + 1000,
      },
      {
        type: 'tokens',
        accessToken: 'unsafe\r\nheader',
        accessTokenExpiration: initialTime + 1000,
      },
      { type: 'tokens', accessToken: 'fixture-token' },
      {
        type: 'tokens',
        accessToken: 'fixture-token',
        accessTokenExpiration: '1800000001000',
      },
      {
        type: 'tokens',
        accessToken: 'fixture-token',
        accessTokenExpiration: initialTime,
      },
      {
        type: 'tokens',
        accessToken: 'fixture-token',
        accessTokenExpiration: initialTime - 1,
      },
      {
        type: 'tokens',
        accessToken: 'fixture-token',
        accessTokenExpiration: initialTime / 1000 + 3600,
      },
      {
        type: 'tokens',
        accessToken: 'fixture-token',
        accessTokenExpiration: initialTime + 0.5,
      },
      {
        type: 'tokens',
        accessToken: 'fixture-token',
        accessTokenExpiration: 1e100,
      },
    ].map((input) => [input] as const),
  )(
    'rejects malformed, expired, and incorrectly scaled token data: %#',
    async (input) => {
      const provider = createTokenProvider(config, {
        now: () => initialTime,
        fetch: () => Promise.resolve(Response.json(input)),
      });
      await expectFailure(provider.getToken(), 'INVALID_RESPONSE', false);
    },
  );

  test.each([
    () =>
      new Response('fixture-secret invalid json', {
        headers: { 'Content-Type': 'application/json' },
      }),
    () =>
      new Response(
        JSON.stringify({
          type: 'tokens',
          accessToken: 'fixture-token',
          accessTokenExpiration: initialTime + 1000,
        }),
      ),
    () =>
      new Response('fixture-secret', {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    () =>
      new Response(
        '{"type":"tokens","accessToken":"fixture-token","accessTokenExpiration":1e999}',
        { headers: { 'Content-Type': 'application/json' } },
      ),
  ])(
    'requires a 200 JSON response and sanitizes invalid bodies: %#',
    async (response) => {
      const provider = createTokenProvider(config, {
        now: () => initialTime,
        fetch: () => Promise.resolve(response()),
      });
      await expectFailure(provider.getToken(), 'INVALID_RESPONSE', false);
    },
  );

  test.each([
    [400, 'AUTHENTICATION_ERROR', false],
    [401, 'AUTHENTICATION_ERROR', false],
    [403, 'PERMISSION_ERROR', false],
    [429, 'NETWORK_ERROR', true],
    [500, 'NETWORK_ERROR', true],
    [307, 'INVALID_RESPONSE', false],
    [308, 'INVALID_RESPONSE', false],
  ] as const)(
    'sanitizes HTTP %s without reading its error body or retrying',
    async (status, code, retryable) => {
      let calls = 0;
      let cancelled = false;
      const provider = createTokenProvider(config, {
        now: () => initialTime,
        fetch: () => {
          calls++;
          return Promise.resolve(
            new Response(
              new ReadableStream({
                cancel() {
                  cancelled = true;
                },
              }),
              {
                status,
                headers: {
                  Location: 'https://untrusted.example/fixture-secret',
                },
              },
            ),
          );
        },
      });
      const error: unknown = await provider
        .getToken()
        .catch((error: unknown) => error);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error).toMatchObject({ error: { code, retryable } });
      expect(String(error)).not.toContain('fixture-secret');
      expect(JSON.stringify(error)).not.toContain('fixture-secret');
      expect(cancelled).toBe(true);
      expect(calls).toBe(1);
    },
  );

  test('clears a failed shared renewal so a later caller can retry without leaking exception details', async () => {
    let calls = 0;
    const provider = createTokenProvider(config, {
      now: () => initialTime,
      fetch: () =>
        ++calls === 1
          ? Promise.reject(
              new Error(
                'fixture-secret fixture-token private upstream details',
              ),
            )
          : Promise.resolve(tokenResponse()),
    });
    const failures = await Promise.allSettled([
      provider.getToken(),
      provider.getToken(),
    ]);
    for (const failure of failures) {
      expect(failure.status).toBe('rejected');
      if (failure.status === 'rejected') {
        const error: unknown = failure.reason;
        expect(error).toMatchObject({
          error: { code: 'NETWORK_ERROR', retryable: true },
        });
        expect(String(error)).not.toContain('fixture-');
        expect(JSON.stringify(error)).not.toContain('fixture-');
      }
    }
    expect(calls).toBe(1);
    expect(await provider.getToken()).toBe('fixture-token');
    expect(calls).toBe(2);
  });

  test('accepts exactly 64 KiB and cancels a chunked token body exceeding the budget', async () => {
    const json = JSON.stringify({
      type: 'tokens',
      accessToken: 'fixture-token',
      accessTokenExpiration: initialTime + 1000,
    });
    const body = json.padEnd(64 * 1024, ' ');
    const exact = createTokenProvider(config, {
      now: () => initialTime,
      fetch: () =>
        Promise.resolve(
          new Response(body, {
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
          }),
        ),
    });
    expect(await exact.getToken()).toBe('fixture-token');
    let cancelled = false;
    let chunk = 0;
    const oversized = createTokenProvider(config, {
      now: () => initialTime,
      fetch: () =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              pull(controller) {
                controller.enqueue(
                  new TextEncoder().encode(chunk++ === 0 ? body : 'x'),
                );
              },
              cancel() {
                cancelled = true;
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        ),
    });
    await expectFailure(oversized.getToken(), 'SIZE_LIMIT', false);
    expect(cancelled).toBe(true);
  });

  test('times out a stalled fetch, aborts it, and allows a subsequent attempt', async () => {
    let calls = 0;
    let aborted = false;
    const provider = createTokenProvider(config, {
      now: () => initialTime,
      timeoutMs: 20,
      fetch: (_url, init) => {
        if (++calls > 1) return Promise.resolve(tokenResponse());
        return new Promise((_resolve, reject) =>
          init.signal?.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new Error('fixture-secret'));
            },
            { once: true },
          ),
        );
      },
    });
    await expectFailure(provider.getToken(), 'TIMEOUT', true);
    expect(aborted).toBe(true);
    expect(await provider.getToken()).toBe('fixture-token');
  });

  test('keeps the deadline active through stalled body consumption and cancels the stream', async () => {
    let cancelled = false;
    const provider = createTokenProvider(config, {
      now: () => initialTime,
      timeoutMs: 20,
      fetch: () =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('{"type":'));
              },
              cancel() {
                cancelled = true;
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        ),
    });
    await expectFailure(provider.getToken(), 'TIMEOUT', true);
    expect(cancelled).toBe(true);
  });
});
