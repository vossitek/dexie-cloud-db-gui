<script lang="ts">
  import { onMount } from 'svelte';
  import type { StatusResponse, TableMetadata } from '../shared/contracts';
  import { getStatus, getTables } from './lib/api';
  import TableList from './components/TableList.svelte';
  import RecordBrowser from './components/RecordBrowser.svelte';

  let status = $state<StatusResponse | null>(null);
  let pending = $state(true);
  let failure = $state<string | null>(null);
  let tables = $state<TableMetadata[] | null>(null);
  let tablesPending = $state(false);
  let tablesFailure = $state<string | null>(null);
  let selectedTable = $state<TableMetadata | null>(null);
  let controller: AbortController | undefined;

  function checkSetup() {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    pending = true;
    failure = null;
    status = null;
    tables = null;
    tablesPending = false;
    tablesFailure = null;
    selectedTable = null;
    void getStatus(current.signal)
      .then(async (result) => {
        if (current.signal.aborted) return;
        status = result;
        pending = false;
        if (result.state !== 'configured') return;
        tablesPending = true;
        try {
          const loaded = await getTables(current.signal);
          if (!current.signal.aborted) tables = loaded;
        } catch (error) {
          if (!current.signal.aborted)
            tablesFailure =
              error instanceof Error
                ? error.message
                : 'Cannot load tables. Check setup and try again.';
        } finally {
          if (!current.signal.aborted) tablesPending = false;
        }
      })
      .catch((error: unknown) => {
        if (!current.signal.aborted) {
          failure =
            error instanceof Error
              ? error.message
              : 'The local API is unavailable. Restart it and try again.';
        }
      })
      .finally(() => {
        if (!current.signal.aborted) pending = false;
      });
  }

  // https://svelte.dev/docs/svelte/lifecycle-hooks#onMount
  onMount(() => {
    checkSetup();
    return () => controller?.abort();
  });
</script>

<a class="skip-link" href="#main-content">Skip to records</a>

<div class="workspace">
  <aside class="sidebar" aria-label="Database workspace">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">d</span>
      <div>
        <p class="brand-name">Dexie Cloud</p>
        <p class="brand-caption">Database explorer</p>
      </div>
    </div>

    <section class="database-summary" aria-labelledby="database-label">
      <h2 class="eyebrow" id="database-label">Database</h2>
      <p class="connection-label">
        <span class="status-dot" aria-hidden="true"></span>
        {#if pending}
          Checking setup…
        {:else if failure}
          API unavailable
        {:else if status?.state === 'configured'}
          Configured
        {:else}
          Not configured
        {/if}
      </p>
      <p class="muted small database-url">
        {status?.state === 'configured'
          ? status.databaseUrl
          : 'Local workspace'}
      </p>
    </section>

    <nav class="table-navigation" aria-labelledby="tables-label">
      <h2 class="eyebrow" id="tables-label">Tables</h2>
      {#if tablesPending}
        <p class="muted small" role="status">Loading table names…</p>
      {:else if tablesFailure}
        <p class="muted small">Table names are unavailable.</p>
      {:else if tables?.length}
        <TableList
          {tables}
          selectedName={selectedTable?.name ?? null}
          onselect={(table: TableMetadata) => {
            selectedTable = table;
          }}
        />
      {:else}
        <p class="muted small">
          {tables
            ? 'The schema export contains no tables.'
            : 'Your tables will appear here after a schema is configured.'}
        </p>
      {/if}
    </nav>

    <div class="sidebar-footer">
      <span class="read-only-icon" aria-hidden="true">◈</span>
      <div>
        <p class="small">An inspection-only workspace</p>
        <p class="muted small">Your cloud data stays unchanged.</p>
      </div>
    </div>
  </aside>

  <main id="main-content" tabindex="-1">
    <header class="workspace-header">
      <div>
        <p class="eyebrow">Workspace</p>
        <h1>Database explorer</h1>
      </div>
      <span class="read-only-badge">Read only</span>
    </header>

    <section class="records-region" aria-labelledby="records-label">
      {#if selectedTable}
        {#key selectedTable.name}
          <RecordBrowser table={selectedTable} />
        {/key}
      {:else}
        <div class="records-header">
          <h2 id="records-label">Records</h2>
          <span class="muted small">No records loaded</span>
        </div>

        <div
          class="empty-state"
          aria-live="polite"
          aria-busy={pending || tablesPending}
        >
          <div class="empty-symbol" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <rect x="4" y="5" width="24" height="22" rx="3"></rect>
              <path d="M4 12h24M12 12v15M4 19h24"></path>
            </svg>
          </div>
          {#if pending}
            <h3>Checking local setup</h3>
            <p>Reading the configuration status of your local workspace.</p>
          {:else if failure}
            <h3>Local API unavailable</h3>
            <p>{failure}</p>
          {:else if status?.state === 'unconfigured'}
            <h3>Database setup required</h3>
            <p>{status.error.message}</p>
          {:else if tablesPending}
            <h3>Loading tables</h3>
            <p>Reading table names from the configured schema export.</p>
          {:else if tablesFailure}
            <h3>Tables unavailable</h3>
            <p>{tablesFailure}</p>
          {:else if tables?.length === 0}
            <h3>No tables in schema export</h3>
            <p>
              The local configuration is valid. Re-export the schema and restart
              the API if you expected tables.
            </p>
          {:else if status?.state === 'configured'}
            <h3>Select a table</h3>
            <p>
              Choose a table from the sidebar to inspect its schema metadata.
            </p>
          {/if}
          <button
            class="setup-retry"
            type="button"
            onclick={checkSetup}
            disabled={pending}
          >
            Check setup again
          </button>
          <span class="empty-hint">
            {status?.state === 'configured'
              ? 'Cloud access has not been verified'
              : 'Read-only access across all realms'}
          </span>
        </div>
      {/if}
    </section>
  </main>
</div>

<style>
  .database-url {
    overflow-wrap: anywhere;
  }
  #records-label {
    overflow-wrap: anywhere;
  }
  .setup-retry {
    margin-top: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-surface);
    color: var(--color-text);
    font-size: 0.8125rem;
    cursor: pointer;
  }
  .setup-retry:hover:not(:disabled) {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .setup-retry:disabled {
    cursor: wait;
  }
</style>
