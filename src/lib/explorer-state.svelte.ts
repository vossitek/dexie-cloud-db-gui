import type {
  DatabaseRecord,
  RecordsResponse,
  TableMetadata,
} from '../../shared/contracts';
import { getRecords, RecordRequestError } from './api';
import { deriveColumns, paginateRecords } from './records';

export type RecordLoader = (
  name: string,
  signal: AbortSignal,
) => Promise<RecordsResponse>;

export function createExplorerState(loadRecords: RecordLoader = getRecords) {
  let table = $state.raw<TableMetadata | null>(null);
  let result = $state.raw<RecordsResponse | null>(null);
  let failure = $state.raw<RecordRequestError | null>(null);
  let pending = $state(false);
  let pageNumber = $state(1);
  let inspected = $state.raw<{
    record: DatabaseRecord;
    opener: HTMLElement;
  } | null>(null);
  const columns = $derived(
    table && result ? deriveColumns(result.records, table.keyPaths) : [],
  );
  let controller: AbortController | undefined;
  let generation = 0;
  let disposed = false;

  function ownsRequest(ticket: number, signal: AbortSignal): boolean {
    return !disposed && ticket === generation && !signal.aborted;
  }

  async function read() {
    const selected = table;
    if (disposed || !selected) return;
    controller?.abort();
    const current = new AbortController();
    controller = current;
    const ticket = ++generation;
    result = null;
    failure = null;
    inspected = null;
    pageNumber = 1;
    pending = true;
    try {
      const loaded = await loadRecords(selected.name, current.signal);
      if (ownsRequest(ticket, current.signal)) result = loaded;
    } catch (error) {
      if (ownsRequest(ticket, current.signal))
        failure =
          error instanceof RecordRequestError
            ? error
            : new RecordRequestError('NETWORK_ERROR', true);
    } finally {
      if (ownsRequest(ticket, current.signal)) {
        pending = false;
        controller = undefined;
      }
    }
  }

  return {
    get table() {
      return table;
    },
    get result() {
      return result;
    },
    get failure() {
      return failure;
    },
    get pending() {
      return pending;
    },
    get pageNumber() {
      return pageNumber;
    },
    get inspected() {
      return inspected;
    },
    get columns() {
      return columns;
    },
    select(next: TableMetadata): Promise<void> {
      if (disposed) return Promise.resolve();
      table = next;
      return read();
    },
    refresh: read,
    setPage(next: number) {
      pageNumber = paginateRecords(result?.records ?? [], next).pageNumber;
      inspected = null;
    },
    inspect(record: DatabaseRecord, opener: HTMLElement) {
      if (!pending && result?.records.includes(record))
        inspected = { record, opener };
    },
    closeInspector() {
      inspected = null;
    },
    dispose() {
      disposed = true;
      generation++;
      controller?.abort();
      controller = undefined;
      table = null;
      result = null;
      failure = null;
      inspected = null;
      pageNumber = 1;
      pending = false;
    },
  };
}
