import type { TableMetadata } from '../shared/contracts';

const keyPathPattern =
  /^[$_\p{ID_Start}][$\u200C\u200D\p{ID_Continue}]*(?:\.[$_\p{ID_Start}][$\u200C\u200D\p{ID_Continue}]*)*$/u;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// https://dexie.org/docs/Version/Version.stores()#detailed-schema-syntax
// Dexie Cloud additionally supports @-generated string primary keys.
function parsePrimaryKey(primaryKey: string): string[] {
  if (primaryKey === '' || primaryKey === '++') return [];
  let key = primaryKey;
  if (key.startsWith('@')) key = key.slice(1);
  else if (key.startsWith('++')) key = key.slice(2);

  const compound = primaryKey.startsWith('[') && primaryKey.endsWith(']');
  const keyPaths = compound
    ? primaryKey
        .slice(1, -1)
        .split('+')
        .map((part) => part.trim())
    : [key];
  if (!keyPaths.every((path) => keyPathPattern.test(path))) {
    throw new Error('Schema export contains an invalid primary key.');
  }
  return keyPaths;
}

export function parseSchema(input: unknown): TableMetadata[] {
  if (
    !isObject(input) ||
    !Object.hasOwn(input, 'schema') ||
    !isObject(input.schema)
  ) {
    throw new Error('Schema export must contain a schema object.');
  }

  const tables: TableMetadata[] = [];
  for (const [name, definition] of Object.entries(input.schema)) {
    if (definition === null) continue;
    if (!name.trim() || typeof definition !== 'string') {
      throw new Error('Schema export contains an invalid table definition.');
    }
    const primaryKey = (definition.split(',')[0] ?? '').trim();
    tables.push({ name, primaryKey, keyPaths: parsePrimaryKey(primaryKey) });
  }
  return tables.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
}
