<script lang="ts">
  import type { DatabaseRecord } from '../../shared/contracts';
  import { paginateRecords, previewCell } from '../lib/records';
  let {
    name,
    records,
    columns,
    pageNumber,
    onpage,
    oninspect,
  }: {
    name: string;
    records: readonly DatabaseRecord[];
    columns: readonly string[];
    pageNumber: number;
    onpage: (page: number) => void;
    oninspect: (record: DatabaseRecord, opener: HTMLButtonElement) => void;
  } = $props();
  const page = $derived(paginateRecords(records, pageNumber));
  let scrollRegion: HTMLDivElement | undefined;
</script>

<div
  class="record-scroll"
  role="region"
  aria-label="Scrollable records"
  bind:this={scrollRegion}
>
  <div class="scroll-controls">
    <button
      class="action-button"
      type="button"
      aria-label="Scroll records left"
      onclick={() => scrollRegion?.scrollBy({ left: -320 })}
    >
      ←
    </button>
    <button
      class="action-button"
      type="button"
      aria-label="Scroll records right"
      onclick={() => scrollRegion?.scrollBy({ left: 320 })}
    >
      →
    </button>
  </div>
  <table>
    <caption class="visually-hidden">{name} records</caption>
    <thead>
      <tr>
        {#each columns as column (column)}<th scope="col">
            <span class="cell" title={column}>
              {column || '(empty field name)'}
            </span>
          </th>{/each}
        <th scope="col" class="inspect-column">Inspect</th>
      </tr>
    </thead>
    <tbody>
      {#each page.rows as record, index (page.start + index)}
        <tr>
          {#each columns as column (column)}<td>
              <span class="cell">{previewCell(record, column)}</span>
            </td>{/each}
          <td class="inspect-column">
            <button
              class="action-button"
              type="button"
              aria-label={`Inspect record ${page.start + index}`}
              onclick={(event) => oninspect(record, event.currentTarget)}
            >
              Inspect
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
<nav class="record-pagination" aria-label="Record pages">
  <p class="small muted" role="status">
    Records {page.start}–{page.end} of {page.total}
  </p>
  <div class="page-controls">
    <button
      class="action-button"
      type="button"
      onclick={() => onpage(page.pageNumber - 1)}
      disabled={page.pageNumber === 1}
    >
      Previous page
    </button>
    <span class="small">Page {page.pageNumber} of {page.pageCount}</span>
    <button
      class="action-button"
      type="button"
      onclick={() => onpage(page.pageNumber + 1)}
      disabled={page.pageNumber === page.pageCount}
    >
      Next page
    </button>
  </div>
</nav>

<style>
  .record-scroll {
    overflow-x: auto;
    min-width: 0;
    max-width: 100%;
  }
  .scroll-controls {
    position: sticky;
    left: 0;
    display: flex;
    gap: var(--space-2);
    width: max-content;
    padding: var(--space-2) var(--space-4);
    background: var(--color-surface);
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.8125rem;
    white-space: nowrap;
  }
  th,
  td {
    padding: var(--space-3) var(--space-4);
    text-align: left;
    border-bottom: 1px solid var(--color-border);
  }
  th {
    background: var(--color-accent-soft);
    font-weight: 600;
  }
  .cell {
    display: block;
    max-width: 18rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .inspect-column {
    position: sticky;
    right: 0;
    background: var(--color-surface);
    box-shadow: -1px 0 0 var(--color-border);
  }
  th.inspect-column {
    background: var(--color-accent-soft);
  }
  .record-pagination {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
  }
  .page-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
</style>
