export const MAX_RECORDS = 10_000;
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
export const PAGE_SIZE = 50;
export const REQUEST_TIMEOUT_MS = 30_000;

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type DatabaseRecord = { [key: string]: JsonValue };

export interface TableMetadata {
  name: string;
  primaryKey: string;
  keyPaths: string[];
}

export type ErrorCode =
  | 'FORBIDDEN'
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'PERMISSION_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'SIZE_LIMIT';

export interface ApiError {
  error: { code: ErrorCode; message: string; retryable: boolean };
}

export interface StatusResponse {
  state: 'configured';
  databaseUrl: string;
}

export interface TablesResponse {
  tables: TableMetadata[];
}

export interface RecordsResponse {
  records: DatabaseRecord[];
  fetchedAt: string;
}
