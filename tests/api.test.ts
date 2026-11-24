import { describe, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import {
  getRecords,
  getStatus,
  getTables,
  RecordRequestError,
} from '../src/lib/api';
import { MAX_RECORDS } from '../shared/contracts';

describe('browser setup client', () => {
  test('reads setup with a cancellable, non-cacheable GET', async () => {
    const controller = new AbortController();
    const status = await getStatus(controller.signal, (url, options) => {
      expect(url).toBe('/api/status');
      expect(options.method).toBe('GET');
      expect(options.cache).toBe('no-store');
      expect(options.signal).toBe(controller.signal);
      return Promise.resolve(
        Response.json({
          state: 'configured',
          databaseUrl: 'https://fixture-db.dexie.cloud',
        }),
      );
    });
    expect(status).toEqual({
      state: 'configured',
      databaseUrl: 'https://fixture-db.dexie.cloud',
    });
  });

  test('retains a validated setup error without treating it as a server outage', async () => {
    const status = await getStatus(undefined, () =>
      Promise.resolve(
        Response.json({
          state: 'unconfigured',
          error: {
            code: 'CONFIGURATION_ERROR',
            message: 'Check the schema export.',
            retryable: false,
          },
        }),
      ),
    );
    expect(status).toEqual({
      state: 'unconfigured',
      error: {
        code: 'CONFIGURATION_ERROR',
        message: 'Check the schema export.',
        retryable: false,
      },
    });
  });

  test.each(
    [
      null,
      [],
      {},
      { state: 'connected', databaseUrl: 'fixture' },
      { state: 'configured', databaseUrl: 3 },
      { state: 'unconfigured', error: null },
      {
        state: 'unconfigured',
        error: { code: 'CONFIGURATION_ERROR', message: 'Missing fields' },
      },
      {
        state: 'unconfigured',
        error: { code: 'UNKNOWN', message: 'Error', retryable: false },
      },
    ].map((input) => ({ input })),
  )('rejects malformed setup responses: %j', async ({ input }) => {
    await rejects(
      getStatus(undefined, () => Promise.resolve(Response.json(input))),
      /invalid setup response/,
    );
  });

  test('discards undeclared fields from setup responses', async () => {
    const status = await getStatus(undefined, () =>
      Promise.resolve(
        Response.json({
          state: 'configured',
          databaseUrl: 'https://fixture-db.dexie.cloud',
          clientSecret: 'fixture-secret',
        }),
      ),
    );
    expect(JSON.stringify(status)).not.toContain('fixture-secret');
  });

  test('does not expose network exception details', async () => {
    await rejects(
      getStatus(undefined, () =>
        Promise.reject(new Error('fixture-secret network stack')),
      ),
      {
        message:
          'Start the local API with bun server/index.ts, then check setup again.',
      },
    );
  });

  test('does not expose non-JSON error response bodies', async () => {
    await rejects(
      getStatus(undefined, () =>
        Promise.resolve(new Response('fixture-secret', { status: 502 })),
      ),
      {
        message:
          'Local API returned an error. Restart the local API and check setup again.',
      },
    );
    await rejects(
      getStatus(undefined, () =>
        Promise.resolve(new Response('fixture-secret')),
      ),
      {
        message:
          'The local API returned an invalid setup response. Restart the local API and try again.',
      },
    );
  });
});

describe('browser record client', () => {
  const fetchedAt = '2026-11-20T10:20:30.000Z';
  test('requests only the encoded local read route and preserves complete record values', async () => {
    const controller = new AbortController();
    const records = [
      {
        key: 'one',
        realmId: 'realm-one',
        nested: { array: [null, false, 0] },
        typed: { $t: 'Date', v: '2026-11-20' },
        blob: { _bt: 'Blob', ref: '1:fixture-ref', size: 42 },
      },
    ];
    const result = await getRecords(
      'a/b ?#%😀',
      controller.signal,
      (path, options) => {
        expect(path).toBe('/api/tables/a%2Fb%20%3F%23%25%F0%9F%98%80/records');
        expect(options).toMatchObject({
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        return Promise.resolve(
          Response.json({ records, fetchedAt, clientSecret: 'fixture-secret' }),
        );
      },
    );
    expect(result).toEqual({ records, fetchedAt });
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
    expect(
      await getRecords('empty', undefined, () =>
        Promise.resolve(Response.json({ records: [], fetchedAt })),
      ),
    ).toEqual({ records: [], fetchedAt });
  });

  test.each(
    [
      null,
      [],
      {},
      { records: null, fetchedAt },
      { records: {}, fetchedAt },
      { records: [null], fetchedAt },
      { records: [[]], fetchedAt },
      { records: [1], fetchedAt },
      { records: [], fetchedAt: null },
      { records: [], fetchedAt: 'not a timestamp' },
      { records: [], fetchedAt: '2026-02-31T10:20:30.000Z' },
      {
        records: Array.from({ length: MAX_RECORDS + 1 }, () => ({})),
        fetchedAt,
      },
    ].map((input) => ({ input })),
  )('rejects invalid records and timestamps: %#', async ({ input }) => {
    await rejects(
      getRecords('items', undefined, () =>
        Promise.resolve(Response.json(input)),
      ),
      (error: unknown) => {
        expect(error).toBeInstanceOf(RecordRequestError);
        expect(error).toMatchObject({
          code: 'INVALID_RESPONSE',
          retryable: false,
        });
        return true;
      },
    );
  });

  test('rejects numeric overflow in nested JSON', async () => {
    await rejects(
      getRecords('items', undefined, () =>
        Promise.resolve(
          new Response(
            `{"records":[{"nested":[1e999]}],"fetchedAt":"${fetchedAt}"}`,
          ),
        ),
      ),
      { code: 'INVALID_RESPONSE' },
    );
  });

  test('accepts the full 10,000-record boundary', async () => {
    const records = Array.from({ length: MAX_RECORDS }, (_, key) => ({ key }));
    const result = await getRecords('items', undefined, () =>
      Promise.resolve(Response.json({ records, fetchedAt })),
    );
    expect(result.records).toHaveLength(MAX_RECORDS);
    expect(result.records[MAX_RECORDS - 1]).toEqual({ key: MAX_RECORDS - 1 });
  });

  test.each([
    'AUTHENTICATION_ERROR',
    'PERMISSION_ERROR',
    'TIMEOUT',
    'SIZE_LIMIT',
    'NETWORK_ERROR',
  ] as const)(
    'uses a local template for a structured %s error',
    async (code) => {
      await rejects(
        getRecords('items', undefined, () =>
          Promise.resolve(
            Response.json(
              {
                error: {
                  code,
                  message: 'fixture-secret upstream details',
                  retryable: true,
                },
              },
              { status: 503 },
            ),
          ),
        ),
        (error: unknown) => {
          expect(error).toBeInstanceOf(RecordRequestError);
          expect(error).toMatchObject({ code, retryable: true });
          expect(String(error)).not.toContain('fixture-secret');
          return true;
        },
      );
    },
  );

  test('sanitizes unknown codes, malformed responses and network exceptions', async () => {
    for (const localFetch of [
      () => Promise.reject(new Error('fixture-secret stack')),
      () =>
        Promise.resolve(new Response('fixture-secret HTML', { status: 502 })),
      () =>
        Promise.resolve(
          Response.json(
            {
              error: {
                code: 'constructor',
                message: 'fixture-secret',
                retryable: false,
              },
            },
            { status: 502 },
          ),
        ),
      () =>
        Promise.resolve(
          Response.json(
            {
              error: {
                code: 'TIMEOUT',
                message: 'fixture-secret',
                retryable: 'yes',
              },
            },
            { status: 504 },
          ),
        ),
    ]) {
      await rejects(
        getRecords('items', undefined, localFetch),
        (error: unknown) => {
          expect(error).toBeInstanceOf(RecordRequestError);
          expect(String(error)).not.toContain('fixture-secret');
          return true;
        },
      );
    }
  });

  test('rejects inherited and incomplete error contracts', async () => {
    for (const error of [
      { code: 'constructor', message: 'fixture-secret', retryable: false },
      { code: 'TIMEOUT', retryable: true },
    ]) {
      await rejects(
        getRecords('items', undefined, () =>
          Promise.resolve(Response.json({ error }, { status: 502 })),
        ),
        { code: 'INVALID_RESPONSE' },
      );
    }
  });

  test('does not start an aborted read or expose its cancellation reason', async () => {
    const controller = new AbortController();
    controller.abort('fixture-secret');
    let calls = 0;
    await rejects(
      getRecords('items', controller.signal, () => {
        calls++;
        return Promise.resolve(Response.json({ records: [], fetchedAt }));
      }),
      (error: unknown) => {
        expect(error).toMatchObject({ name: 'AbortError' });
        expect(String(error)).not.toContain('fixture-secret');
        return true;
      },
    );
    expect(calls).toBe(0);
  });
});

describe('browser table metadata client', () => {
  test('uses a cancellable, non-cacheable GET and returns key metadata in alphabetical order', async () => {
    const controller = new AbortController();
    const tables = await getTables(controller.signal, (url, options) => {
      expect(url).toBe('/api/tables');
      expect(options).toMatchObject({
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      return Promise.resolve(
        Response.json({
          tables: [
            {
              name: 'roles',
              primaryKey: '[realmId+name]',
              keyPaths: ['realmId', 'name'],
            },
            {
              name: '__proto__',
              primaryKey: '',
              keyPaths: [],
              ignored: 'fixture-secret',
            },
            { name: 'items', primaryKey: '@meta.key', keyPaths: ['meta.key'] },
          ],
        }),
      );
    });
    expect(tables).toEqual([
      { name: '__proto__', primaryKey: '', keyPaths: [] },
      { name: 'items', primaryKey: '@meta.key', keyPaths: ['meta.key'] },
      {
        name: 'roles',
        primaryKey: '[realmId+name]',
        keyPaths: ['realmId', 'name'],
      },
    ]);
    expect(JSON.stringify(tables)).not.toContain('fixture-secret');
  });

  test('accepts an empty schema', async () => {
    expect(
      await getTables(undefined, () =>
        Promise.resolve(Response.json({ tables: [] })),
      ),
    ).toEqual([]);
  });

  test.each(
    [
      null,
      [],
      {},
      { tables: null },
      { tables: {} },
      { tables: [null] },
      { tables: [[]] },
      { tables: [{ name: '', primaryKey: '@key', keyPaths: ['key'] }] },
      { tables: [{ name: ' ', primaryKey: '@key', keyPaths: ['key'] }] },
      { tables: [{ name: 2, primaryKey: '@key', keyPaths: ['key'] }] },
      { tables: [{ name: 'items', primaryKey: null, keyPaths: ['key'] }] },
      { tables: [{ name: 'items', primaryKey: '@key', keyPaths: null }] },
      { tables: [{ name: 'items', primaryKey: '@key', keyPaths: [''] }] },
      { tables: [{ name: 'items', primaryKey: '@key', keyPaths: ['key', 1] }] },
      {
        tables: [
          { name: 'items', primaryKey: '', keyPaths: [] },
          { name: 'items', primaryKey: '', keyPaths: [] },
        ],
      },
    ].map((input) => ({ input })),
  )('rejects malformed or duplicate metadata: %#', async ({ input }) => {
    await rejects(
      getTables(undefined, () => Promise.resolve(Response.json(input))),
      /invalid table metadata/,
    );
  });

  test('uses local templates for transport, HTTP and malformed-body errors', async () => {
    for (const fetch of [
      () => Promise.reject(new Error('fixture-secret exception')),
      () =>
        Promise.resolve(
          new Response('fixture-secret upstream body', { status: 503 }),
        ),
      () => Promise.resolve(new Response('fixture-secret invalid JSON')),
    ]) {
      await rejects(getTables(undefined, fetch), (error: unknown) => {
        expect(error).toBeInstanceOf(Error);
        expect(String(error)).not.toContain('fixture-secret');
        return true;
      });
    }
  });
});
