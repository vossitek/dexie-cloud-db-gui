import type { StatusResponse } from '../../shared/contracts';

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
