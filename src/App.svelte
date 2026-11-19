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
        <span class="status-dot" aria-hidden="true"></span>Not configured
      </p>
      <p class="muted small">Local workspace</p>
    </section>

    <nav class="table-navigation" aria-labelledby="tables-label">
      <h2 class="eyebrow" id="tables-label">Tables</h2>
      <p class="muted small">
        Your tables will appear here after a schema is configured.
      </p>
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
      <div class="records-header">
        <h2 id="records-label">Records</h2>
        <span class="muted small">No records loaded</span>
      </div>

      <div class="empty-state">
        <div class="empty-symbol" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <rect x="4" y="5" width="24" height="22" rx="3"></rect>
            <path d="M4 12h24M12 12v15M4 19h24"></path>
          </svg>
        </div>
        <h3>No database configured</h3>
        <p>
          Configure a database connection and schema export to browse your
          tables and inspect their records.
        </p>
        <span class="empty-hint">Read-only access across all realms</span>
      </div>
    </section>
  </main>
</div>
