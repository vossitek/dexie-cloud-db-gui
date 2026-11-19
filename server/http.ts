import { isLocalRequest, type ServerMode } from './request-guard';
import type { SetupState } from './config';
import type {
  ApiError,
  StatusResponse,
  TablesResponse,
} from '../shared/contracts';

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
}: {
  mode: ServerMode;
  setup: SetupState;
}) {
  return (request: Request): Response => {
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
