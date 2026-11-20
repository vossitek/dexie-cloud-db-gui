import { createServer } from 'vite';
import viteConfig from '../vite.config';
import { loadConfiguration } from '../server/config';
import { createHandler, jsonResponse } from '../server/http';
import { REQUEST_TIMEOUT_MS } from '../shared/contracts';
import {
  fixtureEnvironment,
  fixtureFetch,
  fixtureSchema,
  fixtureTime,
  recordsForCount,
} from './fixtures';

const configured = await loadConfiguration(fixtureEnvironment, () =>
  Promise.resolve(JSON.stringify(fixtureSchema)),
);
const empty = await loadConfiguration(fixtureEnvironment, () =>
  Promise.resolve('{"schema":{}}'),
);
const missing = await loadConfiguration({});
const handlers = new Map<string, ReturnType<typeof createHandler>>(
  (
    [
      ['configured', configured],
      ['empty-schema', empty],
      ['unconfigured', missing],
    ] as const
  ).map(([name, setup]) => {
    // All variants run the production handlers and their normal access guards.
    return [
      name,
      createHandler({
        mode: 'development',
        setup,
        upstream: { fetch: fixtureFetch, now: () => fixtureTime },
      }),
    ] as const;
  }),
);
const configuredHandler = handlers.get('configured');
if (!configuredHandler) throw new Error('Missing configured test handler');

for (const count of [0, 1, 50, 51]) {
  const records = recordsForCount(count);
  handlers.set(
    `records-${count}`,
    createHandler({
      mode: 'development',
      setup: configured,
      upstream: {
        fetch: (url, init) => fixtureFetch(url, init, records),
        now: () => fixtureTime,
      },
    }),
  );
}

// Do not load the developer's environment or reuse their running app.
const vite = await createServer({
  ...viteConfig,
  configFile: false,
  envDir: false,
});
let api: ReturnType<typeof Bun.serve> | undefined;
try {
  api = Bun.serve({
    hostname: '127.0.0.1',
    port: 3001,
    idleTimeout: Math.ceil(REQUEST_TIMEOUT_MS / 1000) + 5,
    fetch: (request) =>
      (
        handlers.get(
          request.headers.get('X-Dexie-Test-Scenario') ?? 'configured',
        ) ?? configuredHandler
      )(request),
    error: () =>
      jsonResponse(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'The test server could not complete this request.',
            retryable: true,
          },
        },
        500,
      ),
  });
  await vite.listen();
} catch (error) {
  await api?.stop(true);
  await vite.close();
  throw error;
}

async function stop() {
  await Promise.all([api?.stop(true), vite.close()]);
}
process.once('SIGINT', () => {
  void stop();
});
process.once('SIGTERM', () => {
  void stop();
});
