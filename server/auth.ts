import type { ConnectionConfig } from './config';
import {
  REQUEST_TIMEOUT_MS,
  type ApiError,
  type ErrorCode,
} from '../shared/contracts';

const MAX_TOKEN_BYTES = 64 * 1024;

export class AuthenticationError extends Error {
  readonly error: ApiError['error'];

  constructor(code: ErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'AuthenticationError';
    this.error = { code, message, retryable };
  }
}

interface Token {
  accessToken: string;
  expiresAt: number;
}

type UpstreamFetch = (url: string, init: RequestInit) => Promise<Response>;

function invalidResponse(): AuthenticationError {
  return new AuthenticationError(
    'INVALID_RESPONSE',
    'Dexie Cloud returned an invalid authentication response.',
    false,
  );
}

function parseToken(input: unknown, now: number): Token {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('type' in input) ||
    input.type !== 'tokens' ||
    !('accessToken' in input) ||
    typeof input.accessToken !== 'string' ||
    !/^[A-Za-z0-9._~+/-]+=*$/.test(input.accessToken) ||
    !('accessTokenExpiration' in input) ||
    typeof input.accessTokenExpiration !== 'number' ||
    !Number.isSafeInteger(input.accessTokenExpiration) ||
    input.accessTokenExpiration <= now ||
    input.accessTokenExpiration > 8.64e15
  )
    throw invalidResponse();

  // The official client constructs Date directly from this millisecond timestamp:
  // https://github.com/dexie/Dexie.js/blob/master/addons/dexie-cloud/src/authentication/authenticate.ts
  return {
    accessToken: input.accessToken,
    expiresAt: input.accessTokenExpiration,
  };
}

export function createTokenProvider(
  {
    databaseUrl,
    clientId,
    clientSecret,
  }: Pick<ConnectionConfig, 'databaseUrl' | 'clientId' | 'clientSecret'>,
  {
    fetch: upstreamFetch = fetch,
    now = Date.now,
    timeoutMs = REQUEST_TIMEOUT_MS,
  }: { fetch?: UpstreamFetch; now?: () => number; timeoutMs?: number } = {},
) {
  let cached: Token | undefined;
  let pending: Promise<Token> | undefined;

  async function requestToken(): Promise<Token> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancelBody = () => {
      void reader?.cancel().catch(() => {});
    };
    controller.signal.addEventListener('abort', cancelBody, { once: true });
    try {
      // Client credentials and scope names: https://dexie.org/docs/cloud/rest-api#token
      const response = await upstreamFetch(`${databaseUrl}/token`, {
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          scopes: ['ACCESS_DB', 'GLOBAL_READ'],
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      reader = response.body?.getReader();
      if (controller.signal.aborted) throw new Error('Deadline exceeded');
      if (response.status === 400 || response.status === 401) {
        throw new AuthenticationError(
          'AUTHENTICATION_ERROR',
          'Dexie Cloud rejected the client credentials. Check local configuration and restart the API.',
          false,
        );
      }
      if (response.status === 403) {
        throw new AuthenticationError(
          'PERMISSION_ERROR',
          'The configured client needs ACCESS_DB and GLOBAL_READ permission.',
          false,
        );
      }
      if (response.status === 429 || response.status >= 500) {
        throw new AuthenticationError(
          'NETWORK_ERROR',
          'Dexie Cloud authentication is temporarily unavailable. Try again.',
          true,
        );
      }
      if (
        response.status !== 200 ||
        response.redirected ||
        response.headers
          .get('Content-Type')
          ?.split(';')[0]
          ?.trim()
          .toLowerCase() !== 'application/json' ||
        !reader
      ) {
        throw invalidResponse();
      }
      let bytes = 0;
      let text = '';
      const decoder = new TextDecoder('utf-8', { fatal: true });
      while (true) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) throw new Error('Deadline exceeded');
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_TOKEN_BYTES) {
          throw new AuthenticationError(
            'SIZE_LIMIT',
            'Dexie Cloud authentication response exceeds the supported size.',
            false,
          );
        }
        try {
          text += decoder.decode(value, { stream: true });
        } catch {
          throw invalidResponse();
        }
      }
      let input: unknown;
      try {
        input = JSON.parse(text + decoder.decode());
      } catch {
        throw invalidResponse();
      }
      return parseToken(input, now());
    } catch (error) {
      if (controller.signal.aborted)
        throw new AuthenticationError(
          'TIMEOUT',
          'Dexie Cloud authentication timed out. Try again.',
          true,
        );
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError(
        'NETWORK_ERROR',
        'Cannot reach Dexie Cloud authentication. Check the connection and try again.',
        true,
      );
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', cancelBody);
      // Do not await cancellation: an untrusted stream must not delay an error.
      cancelBody();
    }
  }

  return {
    async getToken(): Promise<string> {
      if (cached && cached.expiresAt > now()) return cached.accessToken;
      cached = undefined;
      pending ??= requestToken();
      try {
        cached = await pending;
        return cached.accessToken;
      } finally {
        pending = undefined;
      }
    },
    invalidate(rejectedToken: string): void {
      if (cached?.accessToken === rejectedToken) cached = undefined;
    },
  };
}
