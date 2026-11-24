import { describe, expect, spyOn, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import type { SetupState } from '../server/config';
import { loadConfiguration } from '../server/config';
import { createHandler, jsonResponse } from '../server/http';
import { MAX_RECORDS, MAX_RESPONSE_BYTES } from '../shared/contracts';

const configured: SetupState = {
  state: 'configured',
  config: {
    databaseUrl: 'https://fixture-db.dexie.cloud',
    clientId: 'fixture-client',
    clientSecret: 'fixture-secret',
    tables: [{ name: 'items', primaryKey: '@key', keyPaths: ['key'] }],
  },
};
const unconfigured = await loadConfiguration({});

function request(path: string, method = 'GET') {
  return new Request(`http://127.0.0.1:3001${path}`, {
    method,
    headers: { Host: '127.0.0.1:3001' },
  });
}

describe('setup API', () => {
  const handle = createHandler({ mode: 'production', setup: configured });

  test('returns only sanitized configured status', async () => {
    const response = await handle(request('/api/status'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      state: 'configured',
      databaseUrl: 'https://fixture-db.dexie.cloud',
    });
  });

  test('reports missing setup as a normal status response', async () => {
    const handleMissing = createHandler({
      mode: 'production',
      setup: unconfigured,
    });
    const response = await handleMissing(request('/api/status'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(unconfigured);
    const tablesResponse = await handleMissing(request('/api/tables'));
    expect(tablesResponse.status).toBe(503);
    if (unconfigured.state !== 'unconfigured')
      throw new Error('Unexpected test setup');
    expect(await tablesResponse.json()).toEqual({ error: unconfigured.error });
  });

  test('returns table metadata without exposing credentials or unrelated configuration', async () => {
    const response = await handle(request('/api/tables'));
    expect(await response.json()).toEqual({ tables: configured.config.tables });
    for (const path of ['/api/status', '/api/tables']) {
      const body = await (await handle(request(path))).text();
      expect(body).not.toContain('fixture-client');
      expect(body).not.toContain('fixture-secret');
      expect(body).not.toContain('clientSecret');
      expect(body).not.toContain('DEXIE_SCHEMA_PATH');
    }
  });

  test('distinguishes an empty valid schema from missing setup', async () => {
    const handleEmpty = createHandler({
      mode: 'production',
      setup: {
        state: 'configured',
        config: { ...configured.config, tables: [] },
      },
    });
    expect(await (await handleEmpty(request('/api/tables'))).json()).toEqual({
      tables: [],
    });
    expect((await handleEmpty(request('/api/status'))).status).toBe(200);
  });

  test.each([
    '/api/status?secret=fixture-secret',
    '/api/tables?',
    '/api/tables#fragment',
  ])('rejects unsupported request parameters: %s', async (path) => {
    expect((await handle(request(path))).status).toBe(400);
  });

  test('setup endpoints never contact the cloud', async () => {
    const upstream = spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Unexpected cloud request'),
    );
    try {
      await handle(request('/api/status'));
      await handle(request('/api/tables'));
      await createHandler({ mode: 'production', setup: unconfigured })(
        request('/api/tables'),
      );
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      upstream.mockRestore();
    }
  });

  test.each(['/api/status', '/api/tables'])(
    'retains request and response safeguards on %s',
    async (path) => {
      expect((await handle(request(path, 'POST'))).status).toBe(405);
      const foreign = new Request(`http://127.0.0.1:3001${path}`, {
        headers: { Host: '127.0.0.1:3001', Origin: 'https://evil.example' },
      });
      expect((await handle(foreign)).status).toBe(403);
      const response = await handle(request(path));
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    },
  );
});

describe('selected-table records API', () => {
  const time = 1_800_000_000_000;
  const rows = [
    {
      key: 'one',
      realmId: 'realm-one',
      owner: 'owner-one',
      value: { $t: 'Date', v: '2026-11-20' },
    },
    {
      key: 'two',
      realmId: 'realm-two',
      image: { _bt: 'Blob', ref: '1:fixture-ref', size: 42 },
      _hasBlobRefs: 1,
    },
  ];
  const names = ['items', 'a/b ?#%😀', '__proto__', 'constructor', '%2F'];
  const setup: SetupState = {
    state: 'configured',
    config: {
      ...configured.config,
      tables: names.map((name) => ({
        name,
        primaryKey: '@key',
        keyPaths: ['key'],
      })),
    },
  };

  function fixture(
    read: () => Response | Promise<Response> = () => Response.json(rows),
    timeoutMs?: number,
  ) {
    const calls: Request[] = [];
    const handle = createHandler({
      mode: 'production',
      setup,
      upstream: {
        now: () => time,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
        fetch: (url: string, init: RequestInit) => {
          calls.push(new Request(url, init));
          if (url.endsWith('/token'))
            return Promise.resolve(
              Response.json({
                type: 'tokens',
                accessToken: 'fixture-token',
                accessTokenExpiration: time + 1000,
              }),
            );
          return Promise.resolve(read());
        },
      },
    });
    return { handle, calls };
  }

  test.each(names)(
    'returns complete records and a timestamp for the decoded table: %s',
    async (name) => {
      const { handle, calls } = fixture();
      const response = await handle(
        request(`/api/tables/${encodeURIComponent(name)}/records`),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        records: rows,
        fetchedAt: new Date(time).toISOString(),
      });
      expect(calls.map((call) => call.url)).toEqual([
        `${configured.config.databaseUrl}/token`,
        `${configured.config.databaseUrl}/all/${encodeURIComponent(name)}`,
      ]);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    },
  );

  test('keeps tokens/credentials out of successful responses and caches no records', async () => {
    let reads = 0;
    const { handle, calls } = fixture(() => Response.json([{ key: ++reads }]));
    const first = await handle(request('/api/tables/items/records'));
    const second = await handle(request('/api/tables/items/records'));
    const text = await second.text();
    expect(await first.json()).toEqual({
      records: [{ key: 1 }],
      fetchedAt: new Date(time).toISOString(),
    });
    expect(JSON.parse(text)).toEqual({
      records: [{ key: 2 }],
      fetchedAt: new Date(time).toISOString(),
    });
    expect(text).not.toContain('fixture-token');
    expect(text).not.toContain('fixture-secret');
    expect(text).not.toContain('fixture-client');
    expect(calls.map((call) => call.method)).toEqual(['POST', 'GET', 'GET']);
  });

  test('returns an empty complete result for an empty table', async () => {
    const { handle } = fixture(() => Response.json([]));
    expect(
      await (await handle(request('/api/tables/items/records'))).json(),
    ).toEqual({ records: [], fetchedAt: new Date(time).toISOString() });
  });

  test('rejects missing configuration before any upstream request', async () => {
    let calls = 0;
    const handle = createHandler({
      mode: 'production',
      setup: unconfigured,
      upstream: {
        fetch: () => {
          calls++;
          throw new Error('Unexpected cloud request');
        },
      },
    });
    const response = await handle(request('/api/tables/items/records'));
    expect(response.status).toBe(503);
    if (unconfigured.state !== 'unconfigured')
      throw new Error('Unexpected test setup');
    expect(await response.json()).toEqual({ error: unconfigured.error });
    expect(calls).toBe(0);
  });

  test.each([
    ['/api/tables/unknown/records', 404],
    ['/api/tables/toString/records', 404],
    ['/api/tables/%252e%252e/records', 404],
    ['/api/tables/items/records/extra', 404],
    ['/api/tables/items/records/', 404],
    ['/api/tables/items%2Fother/records', 404],
    ['/api/tables/%/records', 400],
    ['/api/tables/%FF/records', 400],
    ['/api/tables/items/records?realmId=realm-one', 400],
    ['/api/tables/items/records?', 400],
    ['/api/tables/items/records#fixture-secret', 400],
  ] as const)(
    'rejects unsupported names, paths and parameters without forwarding: %s',
    async (path, status) => {
      const { handle, calls } = fixture();
      expect((await handle(request(path))).status).toBe(status);
      expect(calls).toHaveLength(0);
    },
  );

  test.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])(
    'rejects %s before token acquisition',
    async (method) => {
      const { handle, calls } = fixture();
      expect(
        (await handle(request('/api/tables/items/records', method))).status,
      ).toBe(405);
      expect(calls).toHaveLength(0);
    },
  );

  test.each([
    { Origin: 'https://evil.example' },
    { Host: 'evil.example' },
    { 'Sec-Fetch-Site': 'cross-site' },
    { Host: 'evil.example', 'X-Forwarded-Host': '127.0.0.1:3001' },
  ])(
    'rejects foreign browser context before token acquisition: %j',
    async (headers) => {
      const { handle, calls } = fixture();
      const input = new Request(
        'http://127.0.0.1:3001/api/tables/items/records',
        { headers: { Host: '127.0.0.1:3001', ...headers } },
      );
      expect((await handle(input)).status).toBe(403);
      expect(calls).toHaveLength(0);
    },
  );

  test.each([
    [401, 401, 'AUTHENTICATION_ERROR', true],
    [403, 403, 'PERMISSION_ERROR', false],
    [404, 404, 'NOT_FOUND', false],
    [429, 502, 'NETWORK_ERROR', true],
    [500, 502, 'NETWORK_ERROR', true],
    [307, 502, 'INVALID_RESPONSE', false],
  ] as const)(
    'maps upstream HTTP %s to a sanitized local error',
    async (upstreamStatus, status, code, retryable) => {
      const { handle, calls } = fixture(
        () =>
          new Response('fixture-secret fixture-token fixture-private', {
            status: upstreamStatus,
            headers: { Location: 'https://evil.example/fixture-secret' },
          }),
      );
      const response = await handle(request('/api/tables/items/records'));
      expect(response.status).toBe(status);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ error: { code, retryable } });
      expect(body).not.toHaveProperty('records');
      expect(body).not.toHaveProperty('fetchedAt');
      expect(JSON.stringify(body)).not.toContain('fixture-');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(calls).toHaveLength(upstreamStatus === 401 ? 4 : 2);
    },
  );

  test.each([
    [() => Response.json([null]), 502, 'INVALID_RESPONSE', false],
    [
      () => Response.json(Array.from({ length: MAX_RECORDS + 1 }, () => ({}))),
      413,
      'SIZE_LIMIT',
      false,
    ],
    [
      () =>
        new Response(new Uint8Array(MAX_RESPONSE_BYTES + 1), {
          headers: { 'Content-Type': 'application/json' },
        }),
      413,
      'SIZE_LIMIT',
      false,
    ],
    [
      () =>
        new Response(new ReadableStream(), {
          headers: { 'Content-Type': 'application/json' },
        }),
      504,
      'TIMEOUT',
      true,
    ],
    [
      () => {
        throw new Error('fixture-private fixture-secret fixture-token');
      },
      502,
      'NETWORK_ERROR',
      true,
    ],
  ] as const)(
    'returns structured validation, size, timeout and transport errors: %#',
    async (read, status, code, retryable) => {
      const { handle, calls } = fixture(read, 20);
      const response = await handle(request('/api/tables/items/records'));
      expect(response.status).toBe(status);
      const body: unknown = await response.json();
      expect(body).toMatchObject({ error: { code, retryable } });
      expect(JSON.stringify(body)).not.toContain('fixture-');
      expect(body).not.toHaveProperty('records');
      expect(body).not.toHaveProperty('fetchedAt');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(calls).toHaveLength(2);
    },
  );

  test('passes the local request cancellation signal through without publishing records', async () => {
    const { handle, calls } = fixture();
    const controller = new AbortController();
    controller.abort('fixture-private reason');
    const input = new Request(request('/api/tables/items/records'), {
      signal: controller.signal,
    });
    await rejects(Promise.resolve(handle(input)), { name: 'AbortError' });
    expect(calls).toHaveLength(0);
  });

  test('serves records over real loopback HTTP while retaining Host, origin and method guards', async () => {
    const { handle, calls } = fixture();
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: handle });
    try {
      const url = new URL('/api/tables/items/records', server.url);
      const headers = { Host: '127.0.0.1:3001' };
      const response = await fetch(url, { headers });
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toEqual({
        records: rows,
        fetchedAt: new Date(time).toISOString(),
      });
      const foreign = await fetch(url, {
        headers: { ...headers, Origin: 'https://evil.example' },
      });
      expect(foreign.status).toBe(403);
      await foreign.body?.cancel();
      const mutation = await fetch(url, { method: 'POST', headers });
      expect(mutation.status).toBe(405);
      await mutation.body?.cancel();
      expect(calls.map((call) => call.method)).toEqual(['POST', 'GET']);
    } finally {
      await server.stop(true);
    }
  });

  test('a real client disconnect cancels the upstream response body', async () => {
    let reportStarted: (() => void) | undefined;
    let reportCancelled: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      reportStarted = resolve;
    });
    const cancelled = new Promise<void>((resolve) => {
      reportCancelled = resolve;
    });
    const { handle } = fixture(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(stream) {
              stream.enqueue(new TextEncoder().encode('[{}]'));
              reportStarted?.();
            },
            cancel() {
              reportCancelled?.();
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: handle,
      error: () =>
        jsonResponse(
          {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Request interrupted.',
              retryable: true,
            },
          },
          500,
        ),
    });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = fetch(new URL('/api/tables/items/records', server.url), {
        headers: { Host: '127.0.0.1:3001' },
        signal: controller.signal,
      });
      await started;
      controller.abort();
      await rejects(result, { name: 'AbortError' });
      await Promise.race([
        cancelled,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error('Upstream body was not cancelled after disconnect'),
              ),
            1000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      controller.abort();
      await server.stop(true);
    }
  });
});
