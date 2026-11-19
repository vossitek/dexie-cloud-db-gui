import { isLocalRequest, type ServerMode } from './request-guard';

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

export function createHandler({ mode }: { mode: ServerMode }) {
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
