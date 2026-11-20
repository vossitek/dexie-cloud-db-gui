import { describe, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { createDexieClient, type DexieOptions } from '../server/dexie';
import type { ConnectionConfig } from '../server/config';
import type { ErrorCode, RecordsResponse } from '../shared/contracts';
import { MAX_RECORDS, MAX_RESPONSE_BYTES } from '../shared/contracts';

const initialTime = 1_800_000_000_000;
const names = [
  'items',
  'a/b ?#%😀',
  '__proto__',
  'constructor',
  '.',
  '..',
  '\ud800',
];
const config: ConnectionConfig = {
  databaseUrl: 'https://fixture-db.dexie.cloud',
  clientId: 'fixture-client',
  clientSecret: 'fixture-secret',
  tables: names.map((name) => ({
    name,
    primaryKey: '@key',
    keyPaths: ['key'],
  })),
};
const records = [
  {
    key: 'one',
    realmId: 'realm-one',
    owner: 'owner-one',
    date: { $t: 'Date', v: '2026-11-20' },
  },
  {
    key: 'two',
    realmId: 'realm-two',
    image: { _bt: 'Blob', ref: '1:fixture-ref', size: 42 },
    _hasBlobRefs: 1,
  },
];

function fixture(
  read: (
    request: Request,
    attempt: number,
  ) => Response | Promise<Response> = () => Response.json(records),
  options: Omit<DexieOptions, 'fetch'> = {},
) {
  const requests: Request[] = [];
  let tokens = 0;
  let reads = 0;
  const client = createDexieClient(config, {
    now: () => initialTime,
    ...options,
    fetch: (url, init) => {
      const request = new Request(url, init);
      requests.push(request);
      if (request.url === `${config.databaseUrl}/token`) {
        return Promise.resolve(
          Response.json({
            type: 'tokens',
            accessToken: `fixture-token-${++tokens}`,
            accessTokenExpiration: initialTime + 3_600_000,
          }),
        );
      }
      return Promise.resolve(read(request, ++reads));
    },
  });
  return { client, requests };
}

async function expectFailure(
  result: Promise<RecordsResponse>,
  code: ErrorCode,
  retryable = false,
) {
  await rejects(result, (error: unknown) => {
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ error: { code, retryable } });
    for (const secret of [
      'fixture-secret',
      'fixture-token',
      'fixture-private',
    ]) {
      expect(String(error)).not.toContain(secret);
      expect(JSON.stringify(error)).not.toContain(secret);
    }
    expect(error).not.toHaveProperty('records');
    expect(error).not.toHaveProperty('fetchedAt');
    return true;
  });
}

describe('complete read-only Dexie reads', () => {
  test.each(['items', 'a/b ?#%😀', '__proto__', 'constructor'])(
    'reads only the encoded allowlisted table with no realm filter: %s',
    async (name) => {
      const { client, requests } = fixture();
      expect(await client.readTable(name)).toEqual({
        records,
        fetchedAt: new Date(initialTime).toISOString(),
      });
      expect(requests).toHaveLength(2);
      const [token, read] = requests;
      expect(token!.url).toBe(`${config.databaseUrl}/token`);
      expect(token!.method).toBe('POST');
      expect(await token!.json()).toEqual({
        grant_type: 'client_credentials',
        scopes: ['ACCESS_DB', 'GLOBAL_READ'],
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });
      expect(read!.url).toBe(
        `${config.databaseUrl}/all/${encodeURIComponent(name)}`,
      );
      expect(read!.method).toBe('GET');
      expect(read!.redirect).toBe('manual');
      expect(read!.headers.get('Authorization')).toBe('Bearer fixture-token-1');
      expect(read!.headers.get('Accept')).toBe('application/json');
      expect(read!.body).toBeNull();
      expect(new URL(read!.url).search).toBe('');
    },
  );

  test.each([
    'unknown',
    '../token',
    'items?realmId=one',
    'https://evil.example',
    'toString',
  ])(
    'rejects names outside the schema before authenticating: %s',
    async (name) => {
      const { client, requests } = fixture();
      await expectFailure(client.readTable(name), 'NOT_FOUND');
      expect(requests).toHaveLength(0);
    },
  );

  test.each(['.', '..', '\ud800'])(
    'rejects unencodable or normalizing path segments before authenticating: %#',
    async (name) => {
      const { client, requests } = fixture();
      await expectFailure(client.readTable(name), 'BAD_REQUEST');
      expect(requests).toHaveLength(0);
    },
  );

  test('fetches fresh records on every call while reusing the token', async () => {
    let time = initialTime;
    const { client, requests } = fixture(
      (_request, attempt) => Response.json([{ key: attempt }]),
      { now: () => time },
    );
    expect(await client.readTable('items')).toEqual({
      records: [{ key: 1 }],
      fetchedAt: new Date(time).toISOString(),
    });
    time += 1000;
    expect(await client.readTable('items')).toEqual({
      records: [{ key: 2 }],
      fetchedAt: new Date(time).toISOString(),
    });
    expect(requests.map((request) => request.method)).toEqual([
      'POST',
      'GET',
      'GET',
    ]);
  });

  test('discards a 401 body and renews only once before retrying the same read', async () => {
    let cancelled = false;
    const { client, requests } = fixture((_request, attempt) =>
      attempt === 1
        ? new Response(
            new ReadableStream({
              cancel() {
                cancelled = true;
                return new Promise<void>(() => {});
              },
            }),
            { status: 401 },
          )
        : Response.json(records),
    );
    expect((await client.readTable('items')).records).toEqual(records);
    expect(cancelled).toBe(true);
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/token',
      '/all/items',
      '/token',
      '/all/items',
    ]);
    expect(requests[3]!.headers.get('Authorization')).toBe(
      'Bearer fixture-token-2',
    );
  });

  test.each([
    [401, 'AUTHENTICATION_ERROR', true, 4],
    [403, 'PERMISSION_ERROR', false, 2],
    [404, 'NOT_FOUND', false, 2],
    [429, 'NETWORK_ERROR', true, 2],
    [500, 'NETWORK_ERROR', true, 2],
    [503, 'NETWORK_ERROR', true, 2],
    [400, 'INVALID_RESPONSE', false, 2],
    [302, 'INVALID_RESPONSE', false, 2],
    [307, 'INVALID_RESPONSE', false, 2],
    [308, 'INVALID_RESPONSE', false, 2],
  ] as const)(
    'sanitizes HTTP %s, cancels its body, and bounds retrying',
    async (status, code, retryable, calls) => {
      let cancelled = 0;
      const { client, requests } = fixture(
        () =>
          new Response(
            new ReadableStream({
              cancel() {
                cancelled++;
              },
            }),
            {
              status,
              headers: { Location: 'https://evil.example/fixture-private' },
            },
          ),
      );
      await expectFailure(client.readTable('items'), code, retryable);
      expect(requests).toHaveLength(calls);
      expect(cancelled).toBe(calls / 2);
      expect(requests.every((request) => request.redirect === 'manual')).toBe(
        true,
      );
    },
  );

  test('does not return an earlier result when the next refresh fails', async () => {
    const { client } = fixture((_request, attempt) => {
      if (attempt === 1) return Response.json(records);
      throw new Error('fixture-private fixture-token fixture-secret');
    });
    expect((await client.readTable('items')).records).toEqual(records);
    await expectFailure(client.readTable('items'), 'NETWORK_ERROR', true);
  });

  test.each([
    () =>
      new Response('fixture-private malformed data', {
        headers: { 'Content-Type': 'application/json' },
      }),
    () => Response.json([null]),
    () =>
      new Response('fixture-private HTML', {
        headers: { 'Content-Type': 'text/html' },
      }),
  ])(
    'validates successful upstream bodies before returning a timestamp: %#',
    async (response) => {
      const { client, requests } = fixture(response);
      await expectFailure(client.readTable('items'), 'INVALID_RESPONSE');
      expect(requests).toHaveLength(2);
    },
  );

  test.each([
    () => Response.json(Array.from({ length: MAX_RECORDS + 1 }, () => ({}))),
    () =>
      new Response(new Uint8Array(MAX_RESPONSE_BYTES + 1), {
        headers: { 'Content-Type': 'application/json' },
      }),
  ])(
    'propagates row and byte limits without retry or partial results: %#',
    async (response) => {
      const { client, requests } = fixture(response);
      await expectFailure(client.readTable('items'), 'SIZE_LIMIT');
      expect(requests).toHaveLength(2);
    },
  );

  test('aborts a stalled fetch at the request deadline', async () => {
    let aborted = false;
    const { client } = fixture(
      (request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new Error('fixture-private'));
            },
            { once: true },
          );
        }),
      { timeoutMs: 20 },
    );
    await expectFailure(client.readTable('items'), 'TIMEOUT', true);
    expect(aborted).toBe(true);
  });

  test('keeps the request deadline active during body consumption', async () => {
    let cancelled = false;
    const { client } = fixture(
      () =>
        new Response(
          new ReadableStream({
            start(stream) {
              stream.enqueue(new TextEncoder().encode('[{}]'));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      { timeoutMs: 20 },
    );
    await expectFailure(client.readTable('items'), 'TIMEOUT', true);
    expect(cancelled).toBe(true);
  });

  test('does not authenticate an already cancelled read', async () => {
    const { client, requests } = fixture();
    const controller = new AbortController();
    controller.abort('fixture-private');
    await rejects(client.readTable('items', controller.signal), {
      name: 'AbortError',
    });
    expect(requests).toHaveLength(0);
  });

  test('a disconnected caller stops waiting without cancelling another caller’s shared token renewal', async () => {
    let deliverToken: ((response: Response) => void) | undefined;
    const requests: Request[] = [];
    const client = createDexieClient(config, {
      now: () => initialTime,
      fetch: (url, init) => {
        requests.push(new Request(url, init));
        if (url.endsWith('/token'))
          return new Promise((resolve) => {
            deliverToken = resolve;
          });
        return Promise.resolve(Response.json(records));
      },
    });
    const controller = new AbortController();
    const cancelled = client.readTable('items', controller.signal);
    const active = client.readTable('items');
    controller.abort('fixture-private reason');
    await rejects(cancelled, (error: unknown) => {
      expect(error).toMatchObject({ name: 'AbortError' });
      expect(String(error)).not.toContain('fixture-private');
      return true;
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.signal.aborted).toBe(false);
    if (!deliverToken) throw new Error('Token request did not start');
    deliverToken(
      Response.json({
        type: 'tokens',
        accessToken: 'fixture-token',
        accessTokenExpiration: initialTime + 1000,
      }),
    );
    expect((await active).records).toEqual(records);
    expect(requests).toHaveLength(2);
  });

  test('client cancellation aborts the active data fetch', async () => {
    let started: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let aborted = false;
    const { client } = fixture(
      (request) =>
        new Promise((_resolve, reject) => {
          started?.();
          request.signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new Error('fixture-private transport reason'));
            },
            { once: true },
          );
        }),
    );
    const controller = new AbortController();
    const result = client.readTable('items', controller.signal);
    await ready;
    controller.abort();
    await rejects(result, { name: 'AbortError' });
    expect(aborted).toBe(true);
  });

  test('client cancellation terminates a stalled response body', async () => {
    let started: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    let cancelled = false;
    const { client } = fixture(() => {
      started?.();
      return new Response(
        new ReadableStream<Uint8Array>({
          start(stream) {
            stream.enqueue(new TextEncoder().encode('[{}]'));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    });
    const controller = new AbortController();
    const result = client.readTable('items', controller.signal);
    await ready;
    controller.abort();
    await rejects(result, { name: 'AbortError' });
    expect(cancelled).toBe(true);
  });

  test('does not restart the request deadline when fetch hands over to the body reader', async () => {
    let cancelled = false;
    const { client } = fixture(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 70));
        let timer: ReturnType<typeof setTimeout>;
        return new Response(
          new ReadableStream<Uint8Array>({
            start(stream) {
              timer = setTimeout(() => {
                stream.enqueue(new TextEncoder().encode('[{}]'));
                stream.close();
              }, 70);
            },
            cancel() {
              cancelled = true;
              clearTimeout(timer);
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      },
      { timeoutMs: 120 },
    );
    await expectFailure(client.readTable('items'), 'TIMEOUT', true);
    expect(cancelled).toBe(true);
  });

  test('sanitizes a failed token renewal without issuing a data request', async () => {
    const requests: Request[] = [];
    const client = createDexieClient(config, {
      now: () => initialTime,
      fetch: (url, init) => {
        requests.push(new Request(url, init));
        return Promise.resolve(
          new Response('fixture-private fixture-secret', { status: 401 }),
        );
      },
    });
    await expectFailure(client.readTable('items'), 'AUTHENTICATION_ERROR');
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]!.url).pathname).toBe('/token');
  });
});
