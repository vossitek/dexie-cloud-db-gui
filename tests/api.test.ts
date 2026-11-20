import { describe, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import { getStatus, getTables } from '../src/lib/api';

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
