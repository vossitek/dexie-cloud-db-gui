import { describe, expect, test } from 'bun:test';
import { rejects } from 'node:assert/strict';
import {
  ReadResponseError,
  readRecordsResponse,
} from '../server/read-response';
import {
  MAX_RECORDS,
  MAX_RESPONSE_BYTES,
  type DatabaseRecord,
  type ErrorCode,
} from '../shared/contracts';

const encoder = new TextEncoder();

function chunkedResponse(chunks: Uint8Array[], headers: HeadersInit = {}) {
  let cancelled = false;
  let index = 0;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) controller.enqueue(chunks[index++]);
        else controller.close();
      },
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { 'Content-Type': 'application/json', ...headers } },
  );
  return { response, wasCancelled: () => cancelled };
}

async function expectFailure(
  promise: Promise<DatabaseRecord[]>,
  code: ErrorCode,
  retryable = false,
) {
  await rejects(promise, (error: unknown) => {
    expect(error).toBeInstanceOf(ReadResponseError);
    expect(error).toMatchObject({ error: { code, retryable } });
    expect(String(error)).not.toContain('fixture-private');
    expect(JSON.stringify(error)).not.toContain('fixture-private');
    expect(error).not.toHaveProperty('records');
    return true;
  });
}

describe('bounded record response consumption', () => {
  test('preserves heterogeneous records, typed envelopes, blob references, and unusual own properties', async () => {
    const json =
      '[{"key":"α😀","missing":null,"empty":"","zero":0,"flag":false,"nested":{"items":[1,true,null,{"$t":"Date","v":"2026-11-20T00:00:00.000Z"}]},"inlineBlob":{"$t":"Blob","v":"aGVsbG8="},"blob":{"_bt":"Blob","ref":"1:fixture-reference","size":100,"ct":"image/jpeg"},"_hasBlobRefs":1,"__proto__":{"polluted":true},"constructor":"own value"},{}]';
    const expected: unknown = JSON.parse(json);
    const bytes = encoder.encode(json);
    const { response } = chunkedResponse(
      Array.from(bytes, (byte) => new Uint8Array([byte])),
      { 'Content-Type': 'Application/JSON; charset=utf-8' },
    );
    expect(response.headers.has('Content-Length')).toBe(false);
    const records = await readRecordsResponse(response);
    expect<unknown>(records).toEqual(expected);
    expect(Object.hasOwn(records[0]!, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(records[0])).toBe(Object.prototype);
    expect(response.body?.locked).toBe(false);
  });

  test('accepts an empty table', async () => {
    expect(await readRecordsResponse(Response.json([]))).toEqual([]);
  });

  test.each([undefined, '1', String(MAX_RESPONSE_BYTES + 1)])(
    'accepts exactly 10 MiB based on consumed bytes, irrespective of Content-Length: %s',
    async (contentLength) => {
      const json = '[{"value":"é😀"}]';
      const bytes = encoder.encode(json);
      const remaining = new Uint8Array(
        MAX_RESPONSE_BYTES - bytes.byteLength,
      ).fill(32);
      const { response } = chunkedResponse(
        [bytes, remaining],
        contentLength ? { 'Content-Length': contentLength } : {},
      );
      expect(await readRecordsResponse(response)).toEqual([{ value: 'é😀' }]);
    },
  );

  test.each([false, true])(
    'rejects one byte over 10 MiB and cancels without waiting for EOF (single chunk: %s)',
    async (singleChunk) => {
      const exact = new Uint8Array(MAX_RESPONSE_BYTES).fill(32);
      exact.set(encoder.encode('[{}]'));
      const chunks = singleChunk
        ? [new Uint8Array(MAX_RESPONSE_BYTES + 1).fill(32)]
        : [exact, new Uint8Array([32])];
      let index = 0;
      let cancelled = false;
      const response = new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (index < chunks.length) controller.enqueue(chunks[index++]);
            // Leave the stream open: the reader must cancel on the excess byte.
          },
          cancel() {
            cancelled = true;
          },
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': '4',
          },
        },
      );
      await expectFailure(readRecordsResponse(response), 'SIZE_LIMIT');
      expect(cancelled).toBe(true);
      expect(response.body?.locked).toBe(false);
    },
  );

  test('counts multibyte UTF-8 as bytes rather than string length', async () => {
    const json = JSON.stringify([{ text: 'é'.repeat(MAX_RESPONSE_BYTES / 2) }]);
    expect(json.length).toBeLessThan(MAX_RESPONSE_BYTES);
    await expectFailure(
      readRecordsResponse(
        new Response(encoder.encode(json), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
      'SIZE_LIMIT',
    );
  });

  test('accepts exactly 10,000 records and rejects 10,001 without a partial result', async () => {
    const records = Array.from({ length: MAX_RECORDS }, (_, key) => ({ key }));
    expect(await readRecordsResponse(Response.json(records))).toEqual(records);
    await expectFailure(
      readRecordsResponse(Response.json([...records, { key: MAX_RECORDS }])),
      'SIZE_LIMIT',
    );
  });

  test.each([
    '',
    'fixture-private invalid json',
    '[{}',
    '{}',
    'null',
    '42',
    '[null]',
    '[[]]',
    '[1]',
    '["fixture-private"]',
    '[true]',
    '[{},null]',
    '[{"nested":[{"number":1e999}]}]',
    '[{"number":-1e999}]',
  ])(
    'rejects invalid JSON or record shapes without leaking body data: %#',
    async (body) => {
      await expectFailure(
        readRecordsResponse(
          new Response(body, {
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
        'INVALID_RESPONSE',
      );
    },
  );

  test.each([new Uint8Array([0xff]), new Uint8Array([0xc0, 0xaf])])(
    'rejects malformed UTF-8 instead of substituting replacement characters: %#',
    async (bytes) => {
      const { response } = chunkedResponse([
        encoder.encode('[{"value":"'),
        bytes,
        encoder.encode('"}]'),
      ]);
      await expectFailure(readRecordsResponse(response), 'INVALID_RESPONSE');
    },
  );

  test('rejects a truncated multibyte code point at EOF', async () => {
    const { response } = chunkedResponse([
      encoder.encode('[{"value":"'),
      new Uint8Array([0xf0, 0x9f]),
    ]);
    await expectFailure(readRecordsResponse(response), 'INVALID_RESPONSE');
  });

  test('validates deep records without recursive stack overflow or altering the value', async () => {
    const depth = 20_000;
    const response = new Response(
      `[{"nested":${'['.repeat(depth)}null${']'.repeat(depth)}}]`,
      { headers: { 'Content-Type': 'application/json' } },
    );
    const records = await readRecordsResponse(response);
    let nested = records[0]!.nested;
    for (let index = 0; index < depth; index++) {
      if (!Array.isArray(nested)) throw new Error('Expected nested array');
      nested = nested[0];
    }
    expect(nested).toBeNull();
  });

  test.each([
    { status: 200, headers: {} },
    { status: 200, headers: { 'Content-Type': 'text/html' } },
    { status: 201, headers: { 'Content-Type': 'application/json' } },
    { status: 302, headers: { 'Content-Type': 'application/json' } },
  ])(
    'rejects non-200 or non-JSON responses and cancels their bodies: %#',
    async (init) => {
      let cancelled = false;
      const response = new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
        init,
      );
      await expectFailure(readRecordsResponse(response), 'INVALID_RESPONSE');
      expect(cancelled).toBe(true);
    },
  );

  test('rejects a missing response body', async () => {
    await expectFailure(
      readRecordsResponse(
        new Response(null, {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
      'INVALID_RESPONSE',
    );
  });

  test('sanitizes transport failures after a valid record prefix instead of publishing it', async () => {
    let reads = 0;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (reads++ === 0) controller.enqueue(encoder.encode('[{}]'));
          else controller.error(new Error('fixture-private transport details'));
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    await expectFailure(readRecordsResponse(response), 'NETWORK_ERROR', true);
  });

  test.each(['', '[', '[{}]'])(
    'times out a stalled body without publishing its prefix: %#',
    async (prefix) => {
      let cancelled = false;
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            if (prefix) controller.enqueue(encoder.encode(prefix));
          },
          cancel() {
            cancelled = true;
            // Neither upstream cancellation nor EOF may delay the deadline error.
            return new Promise<void>(() => {});
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
      await expectFailure(
        readRecordsResponse(response, { timeoutMs: 20 }),
        'TIMEOUT',
        true,
      );
      expect(cancelled).toBe(true);
      expect(response.body?.locked).toBe(false);
    },
    200,
  );

  test('rejects an elapsed deadline even for a complete buffered response', async () => {
    await expectFailure(
      readRecordsResponse(Response.json([{}]), { timeoutMs: 0 }),
      'TIMEOUT',
      true,
    );
  });

  test('cancels a pending read when the client disconnects without leaking the abort reason', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(encoder.encode('[{}]'));
        },
        cancel() {
          cancelled = true;
          return Promise.reject(new Error('fixture-private cancel failure'));
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    const result = readRecordsResponse(response, { signal: controller.signal });
    controller.abort(new Error('fixture-private client details'));
    await rejects(result, (error: unknown) => {
      expect(error).toBeInstanceOf(DOMException);
      expect(error).toMatchObject({ name: 'AbortError' });
      expect(String(error)).not.toContain('fixture-private');
      return true;
    });
    expect(cancelled).toBe(true);
    expect(response.body?.locked).toBe(false);
  }, 200);

  test('cancels an already aborted response before pulling body data', async () => {
    const controller = new AbortController();
    controller.abort('fixture-private reason');
    let pulls = 0;
    let cancelled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>(
        {
          pull(stream) {
            pulls++;
            stream.enqueue(encoder.encode('[{}]'));
            stream.close();
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 },
      ),
      { headers: { 'Content-Type': 'application/json' } },
    );
    await rejects(
      readRecordsResponse(response, { signal: controller.signal }),
      { name: 'AbortError' },
    );
    expect(pulls).toBe(0);
    expect(cancelled).toBe(true);
  });

  test.each([false, true])(
    'honors an upstream deadline signal (already aborted: %s)',
    async (alreadyAborted) => {
      const controller = new AbortController();
      let cancelled = false;
      const response = new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
      const reason = new DOMException(
        'fixture-private deadline details',
        'TimeoutError',
      );
      if (alreadyAborted) controller.abort(reason);
      const result = readRecordsResponse(response, {
        signal: controller.signal,
      });
      if (!alreadyAborted) controller.abort(reason);
      await expectFailure(result, 'TIMEOUT', true);
      expect(cancelled).toBe(true);
    },
    200,
  );

  test('accepts a completed response with a live client signal', async () => {
    const controller = new AbortController();
    expect(
      await readRecordsResponse(Response.json([{ key: 'complete' }]), {
        signal: controller.signal,
      }),
    ).toEqual([{ key: 'complete' }]);
    controller.abort();
  });

  test('cancels a malformed UTF-8 stream even when cancellation never settles', async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(new Uint8Array([0xff]));
        },
        cancel() {
          cancelled = true;
          return new Promise<void>(() => {});
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    await expectFailure(readRecordsResponse(response), 'INVALID_RESPONSE');
    expect(cancelled).toBe(true);
    expect(response.body?.locked).toBe(false);
  }, 200);

  test('an independent read still succeeds after another read times out', async () => {
    const stalled = new Response(new ReadableStream<Uint8Array>(), {
      headers: { 'Content-Type': 'application/json' },
    });
    const first = expectFailure(
      readRecordsResponse(stalled, { timeoutMs: 20 }),
      'TIMEOUT',
      true,
    );
    expect(
      await readRecordsResponse(Response.json([{ key: 'other' }])),
    ).toEqual([{ key: 'other' }]);
    await first;
    expect(
      await readRecordsResponse(Response.json([{ key: 'retry' }])),
    ).toEqual([{ key: 'retry' }]);
  }, 200);
});
