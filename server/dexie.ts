import { AuthenticationError, createTokenProvider } from './auth';
import type { ConnectionConfig } from './config';
import { ReadResponseError, readRecordsResponse } from './read-response';
import { REQUEST_TIMEOUT_MS, type RecordsResponse } from '../shared/contracts';

export interface DexieOptions {
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
  timeoutMs?: number;
}

export function createDexieClient(
  config: ConnectionConfig,
  {
    fetch: upstreamFetch = fetch,
    now = Date.now,
    timeoutMs = REQUEST_TIMEOUT_MS,
  }: DexieOptions = {},
) {
  const tables = new Set(config.tables.map((table) => table.name));
  const tokens = createTokenProvider(config, {
    fetch: upstreamFetch,
    now,
    timeoutMs,
  });

  // A disconnected caller must stop waiting without cancelling a renewal shared
  // by other reads. The token provider retains its own bounded deadline.
  function tokenForRead(signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener('abort', abort);
        reject(new DOMException('Record request cancelled.', 'AbortError'));
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
      void tokens.getToken().then(
        (token) => {
          signal.removeEventListener('abort', abort);
          resolve(token);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', abort);
          reject(
            error instanceof Error
              ? error
              : new Error('Authentication failed.'),
          );
        },
      );
    });
  }

  return {
    async readTable(
      name: string,
      clientSignal?: AbortSignal,
    ): Promise<RecordsResponse> {
      if (!tables.has(name))
        throw new ReadResponseError(
          'NOT_FOUND',
          'This table is not present in the configured schema.',
        );
      let encoded: string;
      try {
        encoded = encodeURIComponent(name);
        // URL parsing normalizes literal and encoded dot segments.
        if (encoded === '.' || encoded === '..') throw new Error('Dot segment');
      } catch {
        throw new ReadResponseError(
          'BAD_REQUEST',
          'This table name cannot be encoded safely for the Dexie Cloud REST endpoint.',
        );
      }

      const controller = new AbortController();
      const signal = controller.signal;
      const deadline = performance.now() + timeoutMs;
      const timeout = () =>
        controller.abort(
          new DOMException('Reading this table timed out.', 'TimeoutError'),
        );
      const cancel = () =>
        controller.abort(
          new DOMException('Record request cancelled.', 'AbortError'),
        );
      const checkAbort = () => {
        if (performance.now() >= deadline) timeout();
        signal.throwIfAborted();
      };
      const timer = setTimeout(timeout, timeoutMs);
      clientSignal?.addEventListener('abort', cancel, { once: true });
      if (clientSignal?.aborted) cancel();
      try {
        let retried = false;
        while (true) {
          checkAbort();
          const token = await tokenForRead(signal);
          checkAbort();
          let response: Response | undefined;
          try {
            // https://dexie.org/docs/cloud/rest-api#all-endpoint
            response = await upstreamFetch(
              `${config.databaseUrl}/all/${encoded}`,
              {
                method: 'GET',
                redirect: 'manual',
                cache: 'no-store',
                signal,
                headers: {
                  Accept: 'application/json',
                  Authorization: `Bearer ${token}`,
                },
              },
            );
            checkAbort();
            if (!response.redirected && response.status === 401) {
              tokens.invalidate(token);
              if (!retried) {
                retried = true;
                continue;
              }
              throw new ReadResponseError(
                'AUTHENTICATION_ERROR',
                'Dexie Cloud rejected the renewed token. Check local credentials and try again.',
                true,
              );
            }
            if (response.status === 403)
              throw new ReadResponseError(
                'PERMISSION_ERROR',
                'The configured client cannot read this table. Check ACCESS_DB and GLOBAL_READ permission.',
              );
            if (response.status === 404)
              throw new ReadResponseError(
                'NOT_FOUND',
                'This table is unavailable in Dexie Cloud. Re-export the schema and restart the local API.',
              );
            if (response.status === 429 || response.status >= 500)
              throw new ReadResponseError(
                'NETWORK_ERROR',
                'Dexie Cloud is temporarily unavailable. Try again.',
                true,
              );
            const records = await readRecordsResponse(response, { signal });
            checkAbort();
            return { records, fetchedAt: new Date(now()).toISOString() };
          } finally {
            // Never consume error bodies or wait for their cancellation to settle.
            void response?.body?.cancel().catch(() => {});
          }
        }
      } catch (error) {
        if (signal.aborted) {
          const reason: unknown = signal.reason;
          if (reason instanceof DOMException && reason.name === 'TimeoutError')
            throw new ReadResponseError(
              'TIMEOUT',
              'Reading this table timed out. Try again.',
              true,
            );
          throw new DOMException('Record request cancelled.', 'AbortError');
        }
        if (
          error instanceof AuthenticationError ||
          error instanceof ReadResponseError
        )
          throw error;
        throw new ReadResponseError(
          'NETWORK_ERROR',
          'Cannot read from Dexie Cloud. Check the connection and try again.',
          true,
        );
      } finally {
        clearTimeout(timer);
        clientSignal?.removeEventListener('abort', cancel);
      }
    },
  };
}
