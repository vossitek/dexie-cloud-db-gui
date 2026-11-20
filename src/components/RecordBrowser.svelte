<script lang="ts">
  import { onMount } from 'svelte';
  import type { DatabaseRecord, TableMetadata } from '../../shared/contracts';
  import { createExplorerState } from '../lib/explorer-state.svelte';
  import RecordTable from './RecordTable.svelte';
  import RecordInspector from './RecordInspector.svelte';

  let { table }: { table: TableMetadata } = $props();
  const explorer = createExplorerState();

  onMount(() => {
    void explorer.select(table);
    return () => explorer.dispose();
  });
</script>

<div class="records-header">
  <div>
    <h2 id="records-label">{table.name}</h2>
    <p class="small muted key-definition">
      Primary key: <code>{table.primaryKey || 'Out-of-line key'}</code>
    </p>
  </div>
  <div class="record-actions">
    <button
      class="action-button"
      type="button"
      onclick={() => {
        void explorer.refresh();
      }}
    >
      Refresh table
    </button>
    <span class="small muted" role="status">
      {explorer.result
        ? `${explorer.result.records.length} ${explorer.result.records.length === 1 ? 'record' : 'records'}`
        : 'No records loaded'}
    </span>
  </div>
</div>
{#if explorer.result}
  <p class="fetch-time small muted">
    Fetched <time datetime={explorer.result.fetchedAt}>
      {new Date(explorer.result.fetchedAt).toLocaleString()}
    </time>
  </p>
{/if}
{#if explorer.pending}
  <div class="empty-state" role="status" aria-busy="true">
    <h3>Loading records</h3>
    <p>Reading the complete table across all realms.</p>
  </div>
{:else if explorer.failure}
  <div class="empty-state" role="alert">
    <h3>Cannot load records</h3>
    <p>{explorer.failure.message}</p>
    <button
      class="action-button"
      type="button"
      onclick={() => {
        void explorer.refresh();
      }}
    >
      Retry records
    </button>
  </div>
{:else if explorer.result?.records.length === 0}
  <div class="empty-state">
    <h3>This table is empty</h3>
    <p>The complete read returned no records.</p>
  </div>
{:else if explorer.result}
  <RecordTable
    name={table.name}
    records={explorer.result.records}
    columns={explorer.columns}
    pageNumber={explorer.pageNumber}
    onpage={(page: number) => {
      explorer.setPage(page);
    }}
    oninspect={(record: DatabaseRecord, opener: HTMLButtonElement) => {
      explorer.inspect(record, opener);
    }}
  />
{/if}
{#if explorer.inspected}
  <RecordInspector
    record={explorer.inspected.record}
    opener={explorer.inspected.opener}
    tableName={table.name}
    onclose={() => {
      explorer.closeInspector();
    }}
  />
{/if}

<style>
  .record-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-3);
  }
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
