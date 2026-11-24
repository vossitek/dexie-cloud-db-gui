import {
  MAX_RECORDS,
  MAX_RESPONSE_BYTES,
  REQUEST_TIMEOUT_MS,
  type ApiError,
  type DatabaseRecord,
  type ErrorCode,
} from '../shared/contracts';

export class ReadResponseError extends Error {
  readonly error: ApiError['error'];

  constructor(code: ErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'ReadResponseError';
    this.error = { code, message, retryable };
  }
}

function invalidResponse() {
  return new ReadResponseError(
    'INVALID_RESPONSE',
    'Dexie Cloud returned invalid record data. Check the schema export and try again.',
  );
}

function isRecords(input: unknown): input is DatabaseRecord[] {
  if (
    !Array.isArray(input) ||
    !input.every(
      (record: unknown) =>
        record !== null && typeof record === 'object' && !Array.isArray(record),
    )
  )
    return false;

  // JSON.parse guarantees JSON types, except numeric overflow to Infinity.
  // Walk iteratively so deeply nested valid JSON does not overflow the stack.
  const pending: unknown[] = [input];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === 'number' && !Number.isFinite(value)) return false;
    if (value !== null && typeof value === 'object') {
      for (const child of Object.values(value)) pending.push(child);
    }
  }
  return true;
}

/** Pass the fetch's signal here too, preserving its deadline and client cancellation. */
export async function readRecordsResponse(
  response: Response,
  {
    signal,
    timeoutMs = REQUEST_TIMEOUT_MS,
  }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<DatabaseRecord[]> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const deadline = performance.now() + timeoutMs;
  let timedOut = false;
  const cancelBody = () => {
    // Cancellation may never settle; it must not delay returning an error.
    void reader?.cancel().catch(() => {});
  };
  const timer = setTimeout(() => {
    timedOut = true;
    cancelBody();
  }, timeoutMs);
  signal?.addEventListener('abort', cancelBody, { once: true });
  const checkAbort = () => {
    const reason: unknown = signal?.reason;
    if (
      signal?.aborted &&
      !(reason instanceof DOMException && reason.name === 'TimeoutError')
    ) {
      throw new DOMException('Record request cancelled.', 'AbortError');
    }
    if (signal?.aborted || timedOut || performance.now() >= deadline) {
      throw new ReadResponseError(
        'TIMEOUT',
        'Reading this table timed out. Try again.',
        true,
      );
    }
  };
  try {
    reader = response.body?.getReader();
    checkAbort();
    if (
      response.status !== 200 ||
      response.redirected ||
      !reader ||
      response.headers
        .get('Content-Type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase() !== 'application/json'
    )
      throw invalidResponse();

    let bytes = 0;
    let text = '';
    // Preserve UTF-8 decoder state across chunks and reject malformed input.
    // https://encoding.spec.whatwg.org/#dom-textdecoder-decode
    const decoder = new TextDecoder('utf-8', { fatal: true });
    while (true) {
      const { done, value } = await reader.read();
      checkAbort();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES)
        throw new ReadResponseError(
          'SIZE_LIMIT',
          'This table exceeds the 10 MiB response limit. Select a smaller table.',
        );
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
    if (Array.isArray(input) && input.length > MAX_RECORDS)
      throw new ReadResponseError(
        'SIZE_LIMIT',
        'This table exceeds the 10,000-record limit. Select a smaller table.',
      );
    if (!isRecords(input)) throw invalidResponse();
    checkAbort();
    return input;
  } catch (error) {
    checkAbort();
    if (error instanceof ReadResponseError) throw error;
    throw new ReadResponseError(
      'NETWORK_ERROR',
      'The Dexie Cloud response was interrupted. Check the connection and try again.',
      true,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancelBody);
    cancelBody();
    reader?.releaseLock();
  }
}
