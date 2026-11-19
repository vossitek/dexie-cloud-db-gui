import { describe, expect, test } from 'bun:test';
import { parseSchema } from '../server/schema';
import {
  MAX_RECORDS,
  MAX_RESPONSE_BYTES,
  PAGE_SIZE,
  REQUEST_TIMEOUT_MS,
} from '../shared/contracts';

describe('schema export', () => {
  test('keeps empty tables and sorts names without inferring records', () => {
    expect(
      parseSchema({
        schema: { users: '@userId, email', empty: 'key', deleted: null },
      }),
    ).toEqual([
      { name: 'empty', primaryKey: 'key', keyPaths: ['key'] },
      { name: 'users', primaryKey: '@userId', keyPaths: ['userId'] },
    ]);
    expect(parseSchema({ schema: {} })).toEqual([]);
  });

  test('preserves compound and dotted key definitions', () => {
    expect(
      parseSchema({
        schema: { roles: '[realmId+name]', items: 'meta.key, title' },
      }),
    ).toEqual([
      { name: 'items', primaryKey: 'meta.key', keyPaths: ['meta.key'] },
      {
        name: 'roles',
        primaryKey: '[realmId+name]',
        keyPaths: ['realmId', 'name'],
      },
    ]);
  });

  test('preserves valid hidden and auto-increment key metadata without inventing an id field', () => {
    expect(
      parseSchema({
        schema: { hidden: '', automatic: '++key', compound: '[key]' },
      }),
    ).toEqual([
      { name: 'automatic', primaryKey: '++key', keyPaths: ['key'] },
      { name: 'compound', primaryKey: '[key]', keyPaths: ['key'] },
      { name: 'hidden', primaryKey: '', keyPaths: [] },
    ]);
  });

  test('supports Unicode and unusual table names without prototype assignment', () => {
    const input: unknown = JSON.parse(
      '{"schema":{"__proto__":"key","a/b":"@key","項目":"識別子"}}',
    );
    const tables = parseSchema(input);
    expect(tables.map((table) => table.name)).toEqual([
      '__proto__',
      'a/b',
      '項目',
    ]);
    expect(tables[2]?.keyPaths).toEqual(['識別子']);
  });

  test.each(
    [
      null,
      [],
      {},
      { schema: null },
      { schema: [] },
      { schema: 'items' },
      { schema: { items: 2 } },
      { schema: { '': '@id' } },
      { schema: { items: '@' } },
      { schema: { items: '[id+]' } },
      { schema: { items: '[]' } },
      { schema: { items: '@[realm+id]' } },
      { schema: { items: '&id' } },
      { schema: { items: 'meta..key' } },
    ].map((input) => ({ input })),
  )('rejects malformed or unsupported schema definitions: %j', ({ input }) => {
    expect(() => parseSchema(input)).toThrow();
  });

  test('retains the approved limits', () => {
    expect(MAX_RECORDS).toBe(10_000);
    expect(MAX_RESPONSE_BYTES).toBe(10 * 1024 * 1024);
    expect(PAGE_SIZE).toBe(50);
    expect(REQUEST_TIMEOUT_MS).toBe(30_000);
  });
});
