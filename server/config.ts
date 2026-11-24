import { readFile } from 'node:fs/promises';
import type { ApiError, TableMetadata } from '../shared/contracts';
import { parseSchema } from './schema';

export interface ConnectionConfig {
  databaseUrl: string;
  clientId: string;
  clientSecret: string;
  tables: TableMetadata[];
}

export type SetupState =
  | { state: 'configured'; config: ConnectionConfig }
  | { state: 'unconfigured'; error: ApiError['error'] };

function unconfigured(message: string): SetupState {
  return {
    state: 'unconfigured',
    error: { code: 'CONFIGURATION_ERROR', message, retryable: false },
  };
}

export async function loadConfiguration(
  environment: Record<string, string | undefined>,
  readSchema: (path: string) => Promise<string> = (path) =>
    readFile(path, 'utf8'),
): Promise<SetupState> {
  const {
    DEXIE_DATABASE_URL,
    DEXIE_CLIENT_ID,
    DEXIE_CLIENT_SECRET,
    DEXIE_SCHEMA_PATH,
  } = environment;
  if (
    !DEXIE_DATABASE_URL?.trim() ||
    !DEXIE_CLIENT_ID?.trim() ||
    !DEXIE_CLIENT_SECRET?.trim() ||
    !DEXIE_SCHEMA_PATH?.trim()
  ) {
    return unconfigured(
      'Set DEXIE_DATABASE_URL, DEXIE_CLIENT_ID, DEXIE_CLIENT_SECRET, and DEXIE_SCHEMA_PATH in .env, then restart the local API.',
    );
  }

  let databaseUrl: string;
  try {
    const url = new URL(DEXIE_DATABASE_URL.trim());
    if (
      url.protocol !== 'https:' ||
      !/^[a-z0-9][a-z0-9-]*\.dexie\.cloud$/.test(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.href !== `${url.origin}/`
    ) {
      throw new Error('Unsupported database URL');
    }
    databaseUrl = url.origin;
  } catch {
    return unconfigured(
      'DEXIE_DATABASE_URL must be a hosted HTTPS Dexie Cloud database URL without credentials, a path, query, fragment, or custom port.',
    );
  }

  let contents: string;
  try {
    contents = await readSchema(DEXIE_SCHEMA_PATH);
  } catch {
    return unconfigured(
      'Cannot read the schema export. Check DEXIE_SCHEMA_PATH and file permissions, then restart the local API.',
    );
  }

  try {
    const input: unknown = JSON.parse(contents);
    return {
      state: 'configured',
      config: {
        databaseUrl,
        clientId: DEXIE_CLIENT_ID,
        clientSecret: DEXIE_CLIENT_SECRET,
        tables: parseSchema(input),
      },
    };
  } catch {
    return unconfigured(
      'The schema export is invalid. Supply a JSON file containing a valid schema map, then restart the local API.',
    );
  }
}
