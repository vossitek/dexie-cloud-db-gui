import { isLocalRequest, type ServerMode } from './request-guard';
import type { SetupState } from './config';
import { AuthenticationError } from './auth';
import { createDexieClient, type DexieOptions } from './dexie';
import { ReadResponseError } from './read-response';
import type {
  ApiError,
  ErrorCode,
  StatusResponse,
  TablesResponse,
} from '../shared/contracts';

const errorStatuses: Partial<Record<ErrorCode, number>> = {
  CONFIGURATION_ERROR: 503,
  AUTHENTICATION_ERROR: 401,
  PERMISSION_ERROR: 403,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  SIZE_LIMIT: 413,
  TIMEOUT: 504,
};

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      ...extraHeaders,
    },
  });
}

export function createHandler({
  mode,
  setup,
  upstream,
}: {
  mode: ServerMode;
  setup: SetupState;
  upstream?: DexieOptions;
}) {
  const client =
    setup.state === 'configured'
      ? createDexieClient(setup.config, upstream)
      : {
          readTable: () =>
            Promise.reject(
              new ReadResponseError(
                'CONFIGURATION_ERROR',
                setup.error.message,
                setup.error.retryable,
              ),
            ),
        };

  return async (request: Request): Promise<Response> => {
    if (!isLocalRequest(request, mode)) {
      return jsonResponse(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'Only requests from this local workspace are allowed.',
            retryable: false,
          },
        },
        403,
      );
    }

    if (request.method !== 'GET') {
      return jsonResponse(
        {
          error: {
            code: 'METHOD_NOT_ALLOWED',
            message: 'Only GET requests are supported.',
            retryable: false,
          },
        },
        405,
        { Allow: 'GET' },
      );
    }

    const url = new URL(request.url);
    if (url.search || url.hash || request.url.includes('?')) {
      return jsonResponse(
        {
          error: {
            code: 'BAD_REQUEST',
            message: 'Request parameters are not supported.',
            retryable: false,
          },
        } satisfies ApiError,
        400,
      );
    }

    if (url.pathname === '/api/status') {
      const status: StatusResponse =
        setup.state === 'configured'
          ? { state: 'configured', databaseUrl: setup.config.databaseUrl }
          : { state: 'unconfigured', error: setup.error };
      return jsonResponse(status);
    }

    if (url.pathname === '/api/tables') {
      if (setup.state === 'unconfigured') {
        return jsonResponse({ error: setup.error } satisfies ApiError, 503);
      }
      return jsonResponse({
        tables: setup.config.tables,
      } satisfies TablesResponse);
    }

    const encodedName = /^\/api\/tables\/([^/]+)\/records$/.exec(
      url.pathname,
    )?.[1];
    if (encodedName !== undefined) {
      try {
        let name: string;
        try {
          name = decodeURIComponent(encodedName);
        } catch {
          throw new ReadResponseError(
            'BAD_REQUEST',
            'The table name is not valid URL-encoded text.',
          );
        }
        return jsonResponse(await client.readTable(name, request.signal));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError')
          throw error;
        if (
          error instanceof AuthenticationError ||
          error instanceof ReadResponseError
        ) {
          return jsonResponse(
            { error: error.error } satisfies ApiError,
            errorStatuses[error.error.code] ?? 502,
          );
        }
        return jsonResponse(
          {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'The local server could not complete this request.',
              retryable: true,
            },
          } satisfies ApiError,
          500,
        );
      }
    }

    return jsonResponse(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'This endpoint does not exist.',
          retryable: false,
        },
      },
      404,
    );
  };
}
