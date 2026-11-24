import { expect, spyOn, test } from 'bun:test';
import { formatJson } from '../src/lib/json';
import type { JsonValue } from '../shared/contracts';

test('formats complete nested, typed and blob-reference JSON without reviving values', () => {
  const value = {
    key: 'one',
    owner: 'owner-one',
    realmId: 'realm-one',
    nested: [null, false, 0, ''],
    date: { $t: 'Date', v: '2026-11-20' },
    image: { _bt: 'Blob', ref: '1:fixture-ref', size: 42 },
  };
  expect(formatJson(value)).toBe(JSON.stringify(value, null, 2));
  expect(JSON.parse(formatJson(value))).toEqual(value);
});

test('escapes hostile strings, control characters and unusual own properties', () => {
  const value = {
    constructor: 'stored',
    'quote"': '<script>alert(1)</script>\n\t',
    brackets: '['.repeat(40),
  };
  Object.defineProperty(value, '__proto__', {
    value: { own: true },
    enumerable: true,
  });
  expect(formatJson(value)).toBe(JSON.stringify(value, null, 2));
  expect(JSON.parse(formatJson(value))).toEqual(value);
});

test('uses the iterative fallback when the runtime stringifier reaches its recursion limit', () => {
  const value = {
    items: [null, false, 0, 'line\n"quote"', [], {}],
    typed: { $t: 'Date', v: '2026-11-20' },
  };
  const nativeStringify = JSON.stringify.bind(JSON);
  const expected = nativeStringify(value);
  const stringify = spyOn(JSON, 'stringify').mockImplementation(
    (input: unknown) => {
      if (input !== null && typeof input === 'object')
        throw new RangeError('Recursion limit');
      return nativeStringify(input);
    },
  );
  try {
    expect(formatJson(value)).toBe(expected);
  } finally {
    stringify.mockRestore();
  }
});

test('preserves long values and uses compact JSON when pretty-printing would be expensive', () => {
  const value = { long: `${'α😀'.repeat(40_000)}end of full string` };
  const text = formatJson(value);
  expect(text).toBe(JSON.stringify(value));
  expect(JSON.parse(text)).toEqual(value);
});

test('formats 20,000 nested levels without recursion or data loss', () => {
  const json = `{"nested":${'['.repeat(20_000)}{"leaf":"complete"}${']'.repeat(20_000)}}`;
  const value: JsonValue = JSON.parse(json) as JsonValue;
  expect(formatJson(value)).toBe(json);
});

test('avoids indentation blowup for deep values within the native stringifier limit', () => {
  const json = `${'['.repeat(1000)}{"leaf":"complete"}${']'.repeat(1000)}`;
  const value: JsonValue = JSON.parse(json) as JsonValue;
  expect(formatJson(value)).toBe(json);
});
