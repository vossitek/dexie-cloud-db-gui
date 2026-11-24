import { describe, expect, test } from 'bun:test';
import {
  deriveColumns,
  paginateRecords,
  previewCell,
} from '../src/lib/records';
import type { DatabaseRecord, JsonValue } from '../shared/contracts';

describe('lossless record presentation', () => {
  test('unions all own fields, with compound/dotted key roots first and remaining columns alphabetical', () => {
    const records: DatabaseRecord[] = [
      { zeta: 1, meta: { key: 'one' }, realmId: 'one', alpha: false },
      { realmId: 'two', late: true, beta: null },
    ];
    expect(
      deriveColumns(records, ['realmId', 'meta.key', 'meta.other']),
    ).toEqual(['realmId', 'meta', 'alpha', 'beta', 'late', 'zeta']);
    expect(deriveColumns(records, [])).toEqual([
      'alpha',
      'beta',
      'late',
      'meta',
      'realmId',
      'zeta',
    ]);
    expect(deriveColumns([], ['custom.key'])).toEqual(['custom']);
    expect(deriveColumns([], [])).toEqual([]);
  });

  test('includes fields that first appear after the first display page', () => {
    const records: DatabaseRecord[] = Array.from({ length: 50 }, (_, key) => ({
      key,
    }));
    records.push({ key: 51, late: 'visible on page two' });
    expect(deriveColumns(records, ['key'])).toEqual(['key', 'late']);
  });

  test('handles unusual own properties without including inherited fields', () => {
    const record: DatabaseRecord = {
      constructor: 'own',
      toString: 'own string',
      '': 'empty field name',
    };
    Object.defineProperty(record, '__proto__', {
      value: { inherited: false },
      enumerable: true,
    });
    Object.setPrototypeOf(record, { inherited: 'not a stored field' });
    expect(deriveColumns([record], [])).toEqual([
      '',
      '__proto__',
      'constructor',
      'toString',
    ]);
    expect(previewCell(record, 'inherited')).toBe('Missing');
    expect(previewCell(record, 'constructor')).toBe('"own"');
    expect(previewCell(record, '__proto__')).toBe('Object (1 field)');
    expect(Object.hasOwn(record, '__proto__')).toBe(true);
  });

  test.each([
    [{}, 'value', 'Missing'],
    [{ value: null }, 'value', 'null'],
    [{ value: '' }, 'value', '"" (empty string)'],
    [{ value: 0 }, 'value', '0'],
    [{ value: false }, 'value', 'false'],
    [{ value: true }, 'value', 'true'],
    [{ value: 'null' }, 'value', '"null"'],
    [{ value: 'Missing' }, 'value', '"Missing"'],
    [{ value: 'line\n"quoted"' }, 'value', '"line\\n\\"quoted\\""'],
    [
      { value: '<img src=x onerror=alert(1)>' },
      'value',
      '"<img src=x onerror=alert(1)>"',
    ],
    [{ value: [] }, 'value', 'Array (0 items)'],
    [{ value: [null] }, 'value', 'Array (1 item)'],
    [{ value: [null, false] }, 'value', 'Array (2 items)'],
    [{ value: {} }, 'value', 'Object (0 fields)'],
    [{ value: { nested: [1], empty: null } }, 'value', 'Object (2 fields)'],
    [{ value: { $t: 'Date', v: '2026-11-20' } }, 'value', 'Date (typed value)'],
    [{ value: { $t: 'Blob', v: 'aGVsbG8=' } }, 'value', 'Blob (typed value)'],
    [
      { value: { $t: 'Date', other: 'ordinary object' } },
      'value',
      'Object (2 fields)',
    ],
    [
      { value: { _bt: 'Blob', ref: '1:fixture-ref', size: 42 } },
      'value',
      'Blob (reference)',
    ],
  ] satisfies [DatabaseRecord, string, string][])(
    'labels missing, primitive, nested and typed values distinctly: %#',
    (record, column, expected) => {
      expect(previewCell(record, column)).toBe(expected);
    },
  );

  test('bounds Unicode previews without changing the full string or typed value', () => {
    const value = '😀'.repeat(81);
    const typed = Object.freeze({ $t: 'X'.repeat(1000), v: value });
    const record = Object.freeze({ value, typed });
    expect(previewCell(record, 'value')).toBe(`"${'😀'.repeat(80)}"…`);
    expect(previewCell(record, 'typed')).toBe(
      `${'X'.repeat(80)}… (typed value)`,
    );
    expect(record.value).toBe(value);
    expect(record.typed.v).toBe(value);
    expect(record.typed.$t).toHaveLength(1000);
  });

  test('previews deep nested content without recursively serializing it or discarding values', () => {
    let value: JsonValue = { leaf: 'full value' };
    for (let index = 0; index < 20_000; index++) value = [value];
    const record: DatabaseRecord = { value };
    expect(previewCell(record, 'value')).toBe('Array (1 item)');
    let nested = record.value;
    for (let index = 0; index < 20_000; index++) {
      if (!Array.isArray(nested)) throw new Error('Nested data was lost');
      nested = nested[0];
    }
    expect(nested).toEqual({ leaf: 'full value' });
  });

  test.each([
    [0, 1, 1, 1, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1],
    [50, 1, 1, 1, 1, 50, 50],
    [51, 1, 1, 2, 1, 50, 50],
    [51, 2, 2, 2, 51, 51, 1],
    [100, 2, 2, 2, 51, 100, 50],
    [101, 3, 3, 3, 101, 101, 1],
    [51, 99, 2, 2, 51, 51, 1],
    [51, 0, 1, 2, 1, 50, 50],
    [51, -2, 1, 2, 1, 50, 50],
    [51, 1.9, 1, 2, 1, 50, 50],
    [51, Number.NaN, 1, 2, 1, 50, 50],
    [51, Number.POSITIVE_INFINITY, 1, 2, 1, 50, 50],
  ])(
    'calculates bounded display pages: %#',
    (total, requested, pageNumber, pageCount, start, end, count) => {
      const records = Object.freeze(
        Array.from({ length: total }, (_, key) =>
          Object.freeze({ key, realmId: `realm-${key % 2}` }),
        ),
      );
      const page = paginateRecords(records, requested);
      expect(page).toMatchObject({ pageNumber, pageCount, start, end, total });
      expect(page.rows).toHaveLength(count);
      expect(page.rows.length).toBeLessThanOrEqual(50);
      if (count > 0) {
        expect(page.rows[0]).toBe(records[start - 1]);
        expect(page.rows[count - 1]).toBe(records[end - 1]);
      }
      expect(records).toHaveLength(total);
    },
  );
});
