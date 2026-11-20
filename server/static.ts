import { realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { jsonResponse } from './http';
import { isLocalRequest } from './request-guard';

/** Serve only the SPA entry and emitted JS/CSS assets; never the server bundle. */
export async function createStaticHandler(
  directory: string,
  api: (request: Request) => Promise<Response>,
) {
  let root: string;
  try {
    root = await realpath(directory);
    if (!(await Bun.file(join(root, 'index.html')).exists())) throw new Error();
  } catch {
    throw new Error('Run bun run build before bun run start.');
  }
  return async (request: Request): Promise<Response> => {
    const fail = (status: number, code: string, message: string) =>
      jsonResponse(
        { error: { code, message, retryable: false } },
        status,
        status === 405 ? { Allow: 'GET' } : {},
      );
    if (!isLocalRequest(request, 'production'))
      return fail(
        403,
        'FORBIDDEN',
        'Only requests from this local workspace are allowed.',
      );
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/'))
      return api(request);
    if (request.method !== 'GET')
      return fail(
        405,
        'METHOD_NOT_ALLOWED',
        'Only GET requests are supported.',
      );
    if (url.search || request.url.includes('?'))
      return fail(400, 'BAD_REQUEST', 'Request parameters are not supported.');
    const missing = () => fail(404, 'NOT_FOUND', 'This file does not exist.');
    const path = url.pathname;
    const entry = path === '/' || path === '/index.html';
    // No decoded filesystem paths, arbitrary extensions, dotfiles, or SPA fallback.
    if (!entry && !/^\/assets\/[a-zA-Z0-9_-]+\.(?:js|css)$/.test(path))
      return missing();
    try {
      const filename = await realpath(
        join(root, entry ? 'index.html' : path.slice(1)),
      );
      const allowedRoot = entry ? root : join(root, 'assets');
      if (!filename.startsWith(`${allowedRoot}${sep}`)) return missing();
      const file = Bun.file(filename);
      if (!(await file.exists())) return missing();
      return new Response(file, {
        headers: {
          'Content-Type': entry ? 'text/html; charset=utf-8' : file.type,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'no-referrer',
          'Content-Security-Policy':
            "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        },
      });
    } catch {
      return missing();
    }
  };
}
