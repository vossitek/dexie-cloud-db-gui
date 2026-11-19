import { describe, expect, test } from 'bun:test';
import { loadConfiguration } from '../server/config';

const environment = {
  DEXIE_DATABASE_URL: 'https://example-db.dexie.cloud/',
  DEXIE_CLIENT_ID: 'fixture-client',
  DEXIE_CLIENT_SECRET: 'fixture-secret',
  DEXIE_SCHEMA_PATH: './local/schema.json',
};

describe('connection configuration', () => {
  test('loads only the configured schema and keeps credentials server-side', async () => {
    let loadedPath = '';
    const setup = await loadConfiguration(environment, (path) => {
      loadedPath = path;
      return Promise.resolve('{"schema":{"items":"@key"}}');
    });
    expect(loadedPath).toBe(environment.DEXIE_SCHEMA_PATH);
    expect(setup).toEqual({
      state: 'configured',
      config: {
        databaseUrl: 'https://example-db.dexie.cloud',
        clientId: 'fixture-client',
        clientSecret: 'fixture-secret',
        tables: [{ name: 'items', primaryKey: '@key', keyPaths: ['key'] }],
      },
    });
  });

  test.each(Object.keys(environment))(
    'does not read files if %s is missing',
    async (key) => {
      let reads = 0;
      const setup = await loadConfiguration(
        { ...environment, [key]: '  ' },
        () => {
          reads++;
          return Promise.resolve('{}');
        },
      );
      expect(setup.state).toBe('unconfigured');
      expect(reads).toBe(0);
      expect(JSON.stringify(setup)).not.toContain('fixture-secret');
    },
  );

  test.each([
    'http://example-db.dexie.cloud',
    'https://evil.example',
    'https://127.0.0.1',
    'https://example-db.dexie.cloud.evil.example',
    'https://dexie.cloud',
    'https://user:password@example-db.dexie.cloud',
    'https://example-db.dexie.cloud:3000',
    'https://example-db.dexie.cloud/path',
    'https://example-db.dexie.cloud?token=secret',
    'https://example-db.dexie.cloud#secret',
    'https://example-db.dexie.cloud?',
    'https://example-db.dexie.cloud#',
    'not a URL',
  ])(
    'rejects unsupported database URL without opening the schema: %s',
    async (databaseUrl) => {
      let reads = 0;
      const setup = await loadConfiguration(
        { ...environment, DEXIE_DATABASE_URL: databaseUrl },
        () => {
          reads++;
          return Promise.resolve('{}');
        },
      );
      expect(setup.state).toBe('unconfigured');
      expect(reads).toBe(0);
      expect(JSON.stringify(setup)).not.toContain(databaseUrl);
    },
  );

  test.each(['not json', '{"schema":null}', '{"schema":{"items":12}}'])(
    'returns a safe setup error for an invalid export',
    async (contents) => {
      const setup = await loadConfiguration(environment, () =>
        Promise.resolve(contents),
      );
      expect(setup.state).toBe('unconfigured');
      expect(JSON.stringify(setup)).not.toContain(contents);
    },
  );

  test('sanitizes file-system errors', async () => {
    const setup = await loadConfiguration(environment, () =>
      Promise.reject(new Error('/private/path fixture-secret stack trace')),
    );
    expect(setup).toEqual({
      state: 'unconfigured',
      error: {
        code: 'CONFIGURATION_ERROR',
        message:
          'Cannot read the schema export. Check DEXIE_SCHEMA_PATH and file permissions, then restart the local API.',
        retryable: false,
      },
    });
  });
});
