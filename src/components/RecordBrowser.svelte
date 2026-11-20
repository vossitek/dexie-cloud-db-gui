<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    DatabaseRecord,
    RecordsResponse,
    TableMetadata,
  } from '../../shared/contracts';
  import { getRecords, RecordRequestError } from '../lib/api';
  import { deriveColumns } from '../lib/records';
  import RecordTable from './RecordTable.svelte';
  import RecordInspector from './RecordInspector.svelte';

  let { table }: { table: TableMetadata } = $props();
  // Loaded records are immutable; avoid recursively proxying a complete table.
  // https://svelte.dev/docs/svelte/$state#state.raw
  let result = $state.raw<RecordsResponse | null>(null);
  let pending = $state(true);
  let failure = $state<string | null>(null);
  let pageNumber = $state(1);
  let inspected = $state.raw<{
    record: DatabaseRecord;
    opener: HTMLButtonElement;
  } | null>(null);
  let controller: AbortController | undefined;
  const columns = $derived(
    result ? deriveColumns(result.records, table.keyPaths) : [],
  );

  async function load() {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    result = null;
    failure = null;
    pending = true;
    pageNumber = 1;
    inspected = null;
    try {
      const loaded = await getRecords(table.name, current.signal);
      if (!current.signal.aborted) result = loaded;
    } catch (error) {
      if (!current.signal.aborted)
        failure =
          error instanceof RecordRequestError
            ? error.message
            : 'Cannot load records. Try again.';
    } finally {
      if (!current.signal.aborted) pending = false;
    }
  }

  onMount(() => {
    void load();
    return () => controller?.abort();
  });
</script>

<div class="records-header">
  <div>
    <h2 id="records-label">{table.name}</h2>
    <p class="small muted key-definition">
      Primary key: <code>{table.primaryKey || 'Out-of-line key'}</code>
    </p>
  </div>
  <span class="small muted" role="status">
    {result
      ? `${result.records.length} ${result.records.length === 1 ? 'record' : 'records'}`
      : 'No records loaded'}
  </span>
</div>
{#if result}
  <p class="fetch-time small muted">
    Fetched <time datetime={result.fetchedAt}>
      {new Date(result.fetchedAt).toLocaleString()}
    </time>
  </p>
{/if}
{#if pending}
  <div class="empty-state" role="status" aria-busy="true">
    <h3>Loading records</h3>
    <p>Reading the complete table across all realms.</p>
  </div>
{:else if failure}
  <div class="empty-state" role="alert">
    <h3>Cannot load records</h3>
    <p>{failure}</p>
    <button
      class="action-button"
      type="button"
      onclick={() => {
        void load();
      }}
    >
      Retry records
    </button>
  </div>
{:else if result?.records.length === 0}
  <div class="empty-state">
    <h3>This table is empty</h3>
    <p>The complete read returned no records.</p>
  </div>
{:else if result}
  <RecordTable
    name={table.name}
    records={result.records}
    {columns}
    {pageNumber}
    onpage={(page: number) => {
      pageNumber = page;
      inspected = null;
    }}
    oninspect={(record: DatabaseRecord, opener: HTMLButtonElement) => {
      inspected = { record, opener };
    }}
  />
{/if}
{#if inspected}
  <RecordInspector
    record={inspected.record}
    opener={inspected.opener}
    tableName={table.name}
    onclose={() => {
      inspected = null;
    }}
  />
{/if}

<style>
  h2,
  code {
    overflow-wrap: anywhere;
  }
  .key-definition {
    margin-top: var(--space-1);
  }
  .fetch-time {
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }
</style>
