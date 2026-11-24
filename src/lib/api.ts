import {
  MAX_RECORDS,
  type DatabaseRecord,
  type ErrorCode,
  type RecordsResponse,
  type StatusResponse,
  type TableMetadata,
} from '../../shared/contracts';

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

const recordErrors: Record<ErrorCode, string> = {
  FORBIDDEN:
    'The local API rejected this request. Open the app from its local address.',
  METHOD_NOT_ALLOWED:
    'The local API rejected this read. Restart the app and try again.',
  NOT_FOUND:
    'This table is unavailable. Re-export the schema and restart the API.',
  BAD_REQUEST: 'This table name cannot be read. Check the schema export.',
  INTERNAL_ERROR:
    'The local API could not load records. Restart it and try again.',
  CONFIGURATION_ERROR:
    'Local configuration is invalid. Check setup and restart the API.',
  AUTHENTICATION_ERROR:
    'Dexie Cloud rejected authentication. Check local credentials and restart the API.',
  PERMISSION_ERROR:
    'The configured client cannot read this table. Check ACCESS_DB and GLOBAL_READ permission.',
  TIMEOUT: 'Reading this table timed out. Try again.',
  NETWORK_ERROR:
    'Cannot load records. Check the local API and connection, then try again.',
  INVALID_RESPONSE:
    'The local API returned invalid record data. Restart it and try again.',
  SIZE_LIMIT:
    'This table exceeds the 10,000-record or 10 MiB limit. Select a smaller table.',
};

export class RecordRequestError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly retryable: boolean,
  ) {
    super(recordErrors[code]);
    this.name = 'RecordRequestError';
  }
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(recordErrors, value);
}

function isRecordArray(input: unknown): input is DatabaseRecord[] {
  if (
    !Array.isArray(input) ||
    input.length > MAX_RECORDS ||
    !input.every((record: unknown) => isObject(record))
  )
    return false;
  const pending: unknown[] = [input];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    if (value !== null && typeof value === 'object') {
      for (const child of Object.values(value)) pending.push(child);
    }
  }
  return true;
}

export async function getRecords(
  name: string,
  signal?: AbortSignal,
  localFetch: LocalFetch = fetch,
): Promise<RecordsResponse> {
  const checkAbort = () => {
    if (signal?.aborted)
      throw new DOMException('Record request cancelled.', 'AbortError');
  };
  checkAbort();
  let response: Response;
  try {
    response = await localFetch(
      `/api/tables/${encodeURIComponent(name)}/records`,
      { method: 'GET', cache: 'no-store', signal: signal ?? null },
    );
  } catch {
    checkAbort();
    throw new RecordRequestError('NETWORK_ERROR', true);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    checkAbort();
    throw new RecordRequestError('INVALID_RESPONSE', false);
  }
  checkAbort();
  if (!response.ok) {
    if (
      isObject(body) &&
      isObject(body.error) &&
      isErrorCode(body.error.code) &&
      typeof body.error.message === 'string' &&
      typeof body.error.retryable === 'boolean'
    ) {
      throw new RecordRequestError(body.error.code, body.error.retryable);
    }
    throw new RecordRequestError('INVALID_RESPONSE', false);
  }
  if (
    !isObject(body) ||
    !isRecordArray(body.records) ||
    typeof body.fetchedAt !== 'string' ||
    !Number.isFinite(Date.parse(body.fetchedAt)) ||
    new Date(body.fetchedAt).toISOString() !== body.fetchedAt
  ) {
    throw new RecordRequestError('INVALID_RESPONSE', false);
  }
  return { records: body.records, fetchedAt: body.fetchedAt };
}
