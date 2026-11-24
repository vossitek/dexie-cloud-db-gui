<script lang="ts">
  import type { TableMetadata } from '../../shared/contracts';

  let {
    tables,
    selectedName,
    onselect,
  }: {
    tables: TableMetadata[];
    selectedName: string | null;
    onselect: (table: TableMetadata) => void;
  } = $props();
  let query = $state('');
  // https://svelte.dev/docs/svelte/$derived
  const matches = $derived(
    tables.filter((table) =>
      table.name.toLowerCase().includes(query.trim().toLowerCase()),
    ),
  );
</script>

<label class="muted small" for="table-search">Search tables</label>
<input
  id="table-search"
  type="search"
  bind:value={query}
  placeholder="Filter by name"
/>
<p class="muted small" aria-live="polite">
  {matches.length} of {tables.length} tables
</p>
<ul>
  {#each matches as table (table.name)}
    <li>
      <button
        type="button"
        aria-current={selectedName === table.name ? 'true' : undefined}
        onclick={() => onselect(table)}
      >
        {table.name}
      </button>
    </li>
  {/each}
</ul>
{#if matches.length === 0}
  <p class="muted small">No table names match this filter.</p>
{/if}

<style>
  input {
    min-width: 0;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-muted);
    border-radius: var(--radius);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.8125rem;
  }
  ul {
    display: grid;
    gap: var(--space-1);
    list-style: none;
    margin: 0;
    padding: 0;
    min-width: 0;
  }
  li {
    min-width: 0;
  }
  button {
    width: 100%;
    padding: var(--space-3);
    text-align: left;
    overflow-wrap: anywhere;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    color: var(--color-text);
    font-size: 0.8125rem;
    cursor: pointer;
  }
  button:hover {
    background: var(--color-accent-soft);
  }
  button[aria-current='true'] {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    font-weight: 600;
  }
</style>
