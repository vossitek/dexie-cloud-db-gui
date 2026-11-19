import { describe, expect, spyOn, test } from 'bun:test';
import type { SetupState } from '../server/config';
import { loadConfiguration } from '../server/config';
import { createHandler } from '../server/http';

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
    const response = handle(request('/api/status'));
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
    const response = handleMissing(request('/api/status'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(unconfigured);
    const tablesResponse = handleMissing(request('/api/tables'));
    expect(tablesResponse.status).toBe(503);
    if (unconfigured.state !== 'unconfigured')
      throw new Error('Unexpected test setup');
    expect(await tablesResponse.json()).toEqual({ error: unconfigured.error });
  });

  test('returns table metadata without exposing credentials or unrelated configuration', async () => {
    const response = handle(request('/api/tables'));
    expect(await response.json()).toEqual({ tables: configured.config.tables });
    for (const path of ['/api/status', '/api/tables']) {
      const body = await handle(request(path)).text();
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
    expect(await handleEmpty(request('/api/tables')).json()).toEqual({
      tables: [],
    });
    expect(handleEmpty(request('/api/status')).status).toBe(200);
  });

  test.each([
    '/api/status?secret=fixture-secret',
    '/api/tables?',
    '/api/tables#fragment',
  ])('rejects unsupported request parameters: %s', (path) => {
    expect(handle(request(path)).status).toBe(400);
  });

  test('setup endpoints never contact the cloud', () => {
    const upstream = spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Unexpected cloud request'),
    );
    try {
      handle(request('/api/status'));
      handle(request('/api/tables'));
      createHandler({ mode: 'production', setup: unconfigured })(
        request('/api/tables'),
      );
      expect(upstream).not.toHaveBeenCalled();
    } finally {
      upstream.mockRestore();
    }
  });

  test.each(['/api/status', '/api/tables'])(
    'retains request and response safeguards on %s',
    (path) => {
      expect(handle(request(path, 'POST')).status).toBe(405);
      const foreign = new Request(`http://127.0.0.1:3001${path}`, {
        headers: { Host: '127.0.0.1:3001', Origin: 'https://evil.example' },
      });
      expect(handle(foreign).status).toBe(403);
      const response = handle(request(path));
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    },
  );
});
