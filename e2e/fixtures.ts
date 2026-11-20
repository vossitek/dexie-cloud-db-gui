import { strict as assert } from 'node:assert';
import type { DatabaseRecord } from '../shared/contracts';

export const fixtureTime = 1_800_000_000_000;
export const fixtureEnvironment = {
  DEXIE_DATABASE_URL: 'https://fixture-db.dexie.cloud',
  DEXIE_CLIENT_ID: 'fixture-client',
  DEXIE_CLIENT_SECRET: 'fixture-secret',
  DEXIE_SCHEMA_PATH: '/synthetic/schema.json',
};
export const fixtureSchema = {
  schema: {
    items: '@key',
    roles: '[realmId+name]',
    empty: 'key',
    'a/b ?#%😀': 'meta.key',
    deleted: null,
  },
};
export const fixtureRecords: Record<string, DatabaseRecord[]> = {
  items: [
    {
      key: 'one',
      realmId: 'realm-one',
      owner: 'owner-one',
      name: 'First item',
      createdAt: { $t: 'Date', v: '2026-11-20T00:00:00.000Z' },
      active: false,
      count: 0,
    },
    {
      key: 'two',
      realmId: 'realm-two',
      owner: 'owner-two',
      name: '',
      image: {
        _bt: 'Blob',
        ref: '1:fixture-reference',
        size: 42,
        ct: 'image/jpeg',
      },
      _hasBlobRefs: 1,
    },
    {
      key: 'three',
      realmId: 'realm-two',
      lateField: { nested: [null, true, 'α😀'] },
      note: '<img src=x onerror=alert(1)>',
    },
  ],
  roles: [
    { realmId: 'realm-one', name: 'reader', permissions: { read: true } },
  ],
  empty: [],
  'a/b ?#%😀': [{ meta: { key: 'nested-key' }, value: 'encoded table' }],
};

/** The only upstream transport used by the harness; it performs no network I/O. */
export async function fixtureFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const request = new Request(url, init);
  assert.equal(request.redirect, 'manual');
  if (url === `${fixtureEnvironment.DEXIE_DATABASE_URL}/token`) {
    assert.equal(request.method, 'POST');
    assert.deepEqual(await request.json(), {
      grant_type: 'client_credentials',
      scopes: ['ACCESS_DB', 'GLOBAL_READ'],
      client_id: fixtureEnvironment.DEXIE_CLIENT_ID,
      client_secret: fixtureEnvironment.DEXIE_CLIENT_SECRET,
    });
    return Response.json({
      type: 'tokens',
      accessToken: 'fixture-token',
      accessTokenExpiration: fixtureTime + 3_600_000,
    });
  }
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.get('Authorization'), 'Bearer fixture-token');
  const table = Object.keys(fixtureRecords).find(
    (name) =>
      url ===
      `${fixtureEnvironment.DEXIE_DATABASE_URL}/all/${encodeURIComponent(name)}`,
  );
  assert(table, 'Unexpected synthetic upstream path');
  return Response.json(fixtureRecords[table]);
}
