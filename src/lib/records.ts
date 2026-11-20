import { PAGE_SIZE, type DatabaseRecord } from '../../shared/contracts';

export function deriveColumns(
  records: readonly DatabaseRecord[],
  keyPaths: readonly string[],
): string[] {
  const roots = [
    ...new Set(keyPaths.map((path) => path.split('.')[0] ?? path)),
  ];
  const fields = new Set<string>();
  for (const record of records) {
    for (const field of Object.keys(record)) fields.add(field);
  }
  for (const root of roots) fields.delete(root);
  return [...roots, ...[...fields].sort()];
}

function shorten(value: string): { text: string; truncated: boolean } {
  let text = '';
  let count = 0;
  // Stop after the preview budget; do not copy a potentially multi-megabyte value.
  for (const character of value) {
    if (count === 80) return { text, truncated: true };
    text += character;
    count++;
  }
  return { text, truncated: false };
}

export function previewCell(record: DatabaseRecord, column: string): string {
  if (!Object.hasOwn(record, column)) return 'Missing';
  const value = record[column];
  if (value === undefined) return 'Missing';
  if (value === null) return 'null';
  if (value === '') return '"" (empty string)';
  if (typeof value === 'string') {
    const preview = shorten(value);
    return `${JSON.stringify(preview.text)}${preview.truncated ? '…' : ''}`;
  }
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (Array.isArray(value))
    return `Array (${value.length} item${value.length === 1 ? '' : 's'})`;
  // Recognize envelopes without reviving typed values or resolving blob data.
  if (
    Object.hasOwn(value, '$t') &&
    Object.hasOwn(value, 'v') &&
    typeof value.$t === 'string'
  ) {
    const preview = shorten(value.$t);
    return `${preview.text}${preview.truncated ? '…' : ''} (typed value)`;
  }
  if (
    Object.hasOwn(value, '_bt') &&
    Object.hasOwn(value, 'ref') &&
    typeof value._bt === 'string' &&
    typeof value.ref === 'string'
  ) {
    const preview = shorten(value._bt);
    return `${preview.text}${preview.truncated ? '…' : ''} (reference)`;
  }
  const count = Object.keys(value).length;
  return `Object (${count} field${count === 1 ? '' : 's'})`;
}

export interface RecordPage {
  rows: readonly DatabaseRecord[];
  pageNumber: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
}

export function paginateRecords(
  records: readonly DatabaseRecord[],
  requestedPage: number,
): RecordPage {
  const total = records.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = Number.isFinite(requestedPage)
    ? Math.trunc(requestedPage)
    : 1;
  const pageNumber = Math.max(1, Math.min(pageCount, requested));
  const offset = (pageNumber - 1) * PAGE_SIZE;
  return {
    rows: records.slice(offset, offset + PAGE_SIZE),
    pageNumber,
    pageCount,
    start: total === 0 ? 0 : offset + 1,
    end: Math.min(total, offset + PAGE_SIZE),
    total,
  };
}
