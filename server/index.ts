import { createHandler, jsonResponse } from './http';
import { loadConfiguration } from './config';
import { REQUEST_TIMEOUT_MS } from '../shared/contracts';
import { createStaticHandler } from './static';
import { fileURLToPath } from 'node:url';

const setup = await loadConfiguration(process.env);
const mode = process.argv.includes('--development')
  ? 'development'
  : 'production';
const api = createHandler({ mode, setup });
const handler =
  mode === 'development'
    ? api
    : await createStaticHandler(
        fileURLToPath(new URL('../dist/', import.meta.url)),
        api,
      );

// https://bun.sh/docs/runtime/http/server
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 3001,
  development: false,
  // Let the application return its structured timeout before closing the socket.
  idleTimeout: Math.ceil(REQUEST_TIMEOUT_MS / 1000) + 5,
  fetch: handler,
  error: () =>
    jsonResponse(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The local server could not complete this request.',
          retryable: true,
        },
      },
      500,
    ),
});

console.info('Local API: http://127.0.0.1:3001');
process.once('SIGINT', () => {
  void server.stop(true);
});
process.once('SIGTERM', () => {
  void server.stop(true);
});
