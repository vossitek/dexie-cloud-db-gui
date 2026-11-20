import type { StatusResponse, TableMetadata } from '../../shared/contracts';

type LocalFetch = (path: string, options: RequestInit) => Promise<Response>;
const invalidSetup =
  'The local API returned an invalid setup response. Restart the local API and try again.';

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function getStatus(
  signal?: AbortSignal,
  localFetch: LocalFetch = fetch,
): Promise<StatusResponse> {
  let response: Response;
  try {
    response = await localFetch('/api/status', {
      method: 'GET',
      cache: 'no-store',
      signal: signal ?? null,
    });
  } catch {
    throw new Error(
      'Start the local API with bun server/index.ts, then check setup again.',
    );
  }
  if (!response.ok)
    throw new Error(
      'Local API returned an error. Restart the local API and check setup again.',
    );

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(invalidSetup);
  }
  if (!isObject(body)) throw new Error(invalidSetup);
  if (
    body.state === 'configured' &&
    typeof body.databaseUrl === 'string' &&
    body.databaseUrl.trim()
  ) {
    return { state: 'configured', databaseUrl: body.databaseUrl };
  }
  if (
    body.state === 'unconfigured' &&
    isObject(body.error) &&
    body.error.code === 'CONFIGURATION_ERROR' &&
    typeof body.error.message === 'string' &&
    body.error.message.trim() &&
    typeof body.error.retryable === 'boolean'
  ) {
    return {
      state: 'unconfigured',
      error: {
        code: 'CONFIGURATION_ERROR',
        message: body.error.message,
        retryable: body.error.retryable,
      },
    };
  }
  throw new Error(invalidSetup);
}

export async function getTables(
  signal?: AbortSignal,
  localFetch: LocalFetch = fetch,
): Promise<TableMetadata[]> {
  let response: Response;
  try {
    response = await localFetch('/api/tables', {
      method: 'GET',
      cache: 'no-store',
      signal: signal ?? null,
    });
  } catch {
    throw new Error(
      'Cannot reach the local API to load tables. Check setup and try again.',
    );
  }
  if (!response.ok)
    throw new Error(
      'The local API could not load tables. Check setup and try again.',
    );
  const invalidTables =
    'The local API returned invalid table metadata. Restart the local API and try again.';
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(invalidTables);
  }
  if (!isObject(body) || !Array.isArray(body.tables))
    throw new Error(invalidTables);
  const names = new Set<string>();
  const tables: TableMetadata[] = [];
  const entries: unknown[] = body.tables;
  for (const input of entries) {
    if (
      !isObject(input) ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      typeof input.primaryKey !== 'string' ||
      !Array.isArray(input.keyPaths) ||
      names.has(input.name)
    )
      throw new Error(invalidTables);
    const keyPaths: string[] = [];
    const paths: unknown[] = input.keyPaths;
    for (const path of paths) {
      if (typeof path !== 'string' || !path.trim())
        throw new Error(invalidTables);
      keyPaths.push(path);
    }
    names.add(input.name);
    tables.push({ name: input.name, primaryKey: input.primaryKey, keyPaths });
  }
  return tables.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
}
