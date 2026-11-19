# Spec: Dexie Cloud Database GUI — V1 / Phase 1

Status: approved — user approved the specification and both review questions on 2026-11-19

## Objective

Build a local browser application that lets a database administrator inspect an existing Dexie Cloud database: select a table, browse its records across all realms, and inspect a complete record. Phase 1 never changes cloud data or schema.

This is one capability, a read-only database explorer. Connection setup, table navigation, and record inspection support that capability and share this specification.

### Confirmed requirements

- Audience: database administrators with global database read access.
- Deployment: runs locally on each administrator's machine.
- Stack: Bun, Svelte, and Vite.
- Phase 1: viewing tables and records only.

### Approved defaults

- TypeScript throughout; a Svelte SPA with a local Bun HTTP backend.
- One configured hosted Dexie Cloud database per running instance.
- Database URL and client credentials supplied through local environment configuration, never entered into or persisted by the browser.
- Table names and primary-key definitions supplied through a local Dexie schema export. Automatic discovery is deferred unless an official, compatible read-only metadata API is verified.
- Selected tables are loaded on demand, with a maximum of 10,000 records and a 10 MiB upstream response. Tables exceeding either limit receive an explicit unsupported-size message; no partial result is presented as complete.
- Record display uses pages of 50 rows. This is pagination of an already loaded result, not upstream pagination.

## User Experience and Behavior

### Connection and setup

1. The administrator configures the database URL, client ID, client secret, and schema-file path using a gitignored local `.env` file. `.env.example` documents names with placeholder values.
2. The schema file uses the `schema` map from a Dexie CLI schema export. It is loaded and validated by the backend. Invalid entries produce a setup error before data requests are made. Entries marked deleted are excluded.
3. Startup validates configuration. The interface identifies the configured database and distinguishes missing setup, authentication failure, insufficient permission, and network failure.
4. Refreshing or retrying reads requires no application restart. Changing connection configuration or the schema file requires a restart in Phase 1.

The documented CLI can export schema using `npx dexie-cloud export --schema` after connecting to the desired database. This is an administrator setup step using the official CLI, not an export feature in the GUI. [Dexie CLI export documentation](https://dexie.org/docs/cloud/cli#export)

### Table navigation

- Show configured, non-deleted tables alphabetically in a sidebar with a table-name filter.
- Include empty tables and access-control tables when present in the supplied schema. Do not infer table existence from records.
- Show the selected table's name and primary-key definition.
- Selecting a table fetches only that table's records, across all realms.
- Selecting another table closes the record inspector and prevents an older response from replacing the current table's data.
- An empty schema and an empty table have distinct explanatory states.

### Record browsing

- Render a semantic table with primary-key fields first, followed by the remaining top-level fields alphabetically. Columns are the union of fields in the complete loaded result.
- Support arbitrary field names and shapes. A key may have a custom name or be compound; never assume every record has an `id` property.
- Distinguish missing fields, `null`, empty strings, booleans, and zero. Render nested objects and arrays as compact previews.
- Display loaded record count, page position, previous/next controls, and the last successful fetch time. An empty result shows zero records.
- Long cell values may be visually truncated, with the full returned value available in the record inspector.
- Manual Refresh reloads the selected table and resets its page and inspector. Show loading, success, and retryable failure states without presenting old data as current.
- No background polling, offline replica, persistent record cache, or automatic synchronization.

### Record inspection

- A clearly labeled row action opens a detail panel showing every returned field, including `owner` and `realmId` when present.
- Show formatted JSON with expandable nested objects/arrays or an equivalent readable representation. Grid truncation must not discard the original value.
- Preserve Dexie's typed JSON markers and blob-reference metadata. Identify typed values without converting them in ways that lose information. Do not automatically fetch referenced binary content.
- Render stored text as text, including HTML-like content. Do not execute markup, scripts, or stored URLs.
- The panel is keyboard accessible, has a labeled close action, and returns focus to its opening control.

## Data Access and Safety

- The Bun backend authenticates with client credentials and explicitly requests only `ACCESS_DB` and `GLOBAL_READ`. It does not request write, management, deletion, or impersonation scopes.
- Data reads use the documented `/all/<table>` endpoint. Read-only operation permits the authentication `POST /token`; it permits no data mutation requests. [Dexie REST API](https://dexie.org/docs/cloud/rest-api)
- Use Bun's native `fetch` for the small required REST surface. A synchronization client and IndexedDB replica are unnecessary for this version.
- Validate responses at the backend boundary and preserve typed JSON envelopes end to end. [Dexie special-type response format](https://dexie.org/docs/cloud/rest-api#json-format-for-special-types)
- Keep credentials and upstream tokens in backend memory/configuration only. Do not expose them through browser bundles, `VITE_*` variables, responses, URLs, or logs.
- Expose only explicit read routes for configured tables; provide no arbitrary URL proxy. Encode table names and validate them against the configured schema.
- Bind both development and built application servers to loopback. Validate local Host and browser Origin/Fetch Metadata as appropriate, reject foreign browser origins, and do not enable permissive CORS.
- Serve the built UI and API from one origin. During development, Vite proxies the allowed API paths to the loopback backend.
- Send database responses with `Cache-Control: no-store`. Keep only the active table's result in application memory; do not put records in localStorage, IndexedDB, a service worker cache, or local files.
- Abort an upstream response once it exceeds 10 MiB. Reject a decoded result above 10,000 records. Apply a 30-second upstream timeout and return a clear error, without a misleading count or partial table.
- Retain tokens only until expiry; renew as needed. Retry authentication at most once after a token-expiry failure, then show a recoverable error.
- Do not log records, credentials, tokens, or raw upstream error bodies. Return useful, sanitized error messages.

The current REST reference does not document general table-read pagination or a table-list endpoint. The schema-file and bounded-load requirements are deliberate Phase 1 product choices based on that limitation, not claims that those APIs cannot exist.

## Tech Stack

| Concern | Choice |
| --- | --- |
| Runtime and package manager | Bun 1.4.5, available in this workspace |
| UI | Svelte 5, TypeScript, component-scoped CSS |
| Frontend tooling | Vite 8 with the compatible official Svelte plugin |
| Backend | Bun HTTP server and native fetch |
| Unit/integration tests | Bun test runner |
| Browser tests | Playwright |
| Static checks | TypeScript, svelte-check, ESLint, Prettier with Svelte support |

Resolve compatible exact package versions before implementation, record them in the approved plan and package manifest, and commit `bun.lock`. Validate the chosen Vite/tooling versions under Bun; no Node-only runtime assumption should be hidden in scripts.

References: [Bun documentation](https://bun.sh/docs), [Svelte documentation](https://svelte.dev/docs/svelte/overview), [Vite documentation](https://vite.dev/guide/).

## Commands

These are the required project command interfaces to create during implementation. They are not executable in the current, unscaffolded repository.

```sh
bun install --frozen-lockfile
bun run dev
bun run check
bun run lint
bun run format:check
bun test ./tests
bun run test:e2e -- --project=chromium
bun run build
bun run start
```

- `dev` starts Vite and the backend, both on loopback, and shuts both down cleanly.
- `check` checks Svelte and all frontend, backend, and shared TypeScript.
- `build` creates the distributable frontend and validates the backend entry point.
- `start` serves the built app and read API locally without a development server.
- Tests use deterministic fixtures and mocked upstream responses by default; no production credentials are required.

## Project Structure

```text
src/
  App.svelte              Application shell
  components/             Table list, record table, inspector, status UI
  lib/                    Browser API client, presentation helpers, UI state
server/                   Local HTTP entry point, configuration, Dexie REST adapter
shared/                   Browser/backend types and validation contracts
tests/                    Bun unit and backend integration tests
e2e/                      Playwright user journeys and fixtures
spec/SPEC.md              Requirements and approval status
docs/                     Local setup and troubleshooting documentation
.env.example              Configuration names with placeholder values
bun.lock                  Reproducible dependency resolution
```

Runtime schema exports and credentials are local configuration, excluded from git. No actual database contents belong in test fixtures.

## Code Style

- Strict TypeScript; validate external values from `unknown` before use. No unchecked `any` or silent type assertions at network boundaries.
- PascalCase Svelte components and types, camelCase functions/variables, descriptive names, small focused modules.
- Svelte 5 runes for component state, semantic HTML, scoped CSS, and shared design tokens. Formatting is automated with Prettier.
- Example component style, included as a convention rather than application implementation:

```svelte
<script lang="ts">
  interface Props {
    tableNames: string[];
    onSelect: (tableName: string) => void;
  }

  let { tableNames, onSelect }: Props = $props();
</script>

<nav aria-label="Database tables">
  {#each tableNames as tableName (tableName)}
    <button type="button" onclick={() => onSelect(tableName)}>
      {tableName}
    </button>
  {/each}
</nav>
```

## Testing Strategy

- Unit tests cover schema validation, key handling, column derivation, display-value distinctions, page boundaries, and typed-value preservation.
- Backend integration tests intercept upstream requests and verify token scopes, allowed methods/paths, table allowlisting, response validation, token renewal, timeout/size errors, secret redaction, and foreign-origin/invalid-Host rejection.
- Browser tests cover setup failure, table selection, empty tables, heterogeneous records, custom and compound keys, pagination, record details, refresh, retry, and rapid table switching with delayed responses.
- Include malicious text fixtures and verify they render inertly. Assert that browsing/refresh flows issue no upstream data mutations.
- Keyboard tests verify navigation, visible focus, inspector closure, and focus restoration. Meet WCAG 2.2 AA for the implemented workflow, including labels and contrast.
- Run automated browser tests in Chromium and manually smoke-test the supported workflow in current Firefox and Safari before Phase 1 is accepted.
- Every numbered success criterion must have automated evidence where practical and explicit manual evidence otherwise. No numerical coverage target is imposed by this specification; passing happy-path tests alone is insufficient.
- Before release, perform a read-only smoke test against a disposable/test Dexie Cloud database with known multi-realm records and confirm the upstream protocol and schema assumptions. Do not create or seed that remote database without authorization.

## Boundaries

### Always

- Keep Phase 1 read-only and preserve source values.
- Keep credentials server-side, validate configuration/input, escape stored text, and enforce loading limits.
- Run relevant tests and static checks before committing application changes; run the full listed validation suite before declaring Phase 1 complete.
- Keep setup instructions and this specification aligned with approved behavior.
- Preserve unrelated user files and existing skill configuration.

### Ask first

- Expanding to shared hosting, remote network access, multiple connection profiles, or new authentication models.
- Any remote configuration change, schema change, client/service-account provisioning, or write operation against Dexie Cloud.
- Increasing Phase 1 scope, changing approved loading limits, or weakening verification requirements.
- Adding runtime dependencies beyond the approved stack or changing CI/deployment configuration.

### Never

- Create, update, delete, import, or migrate cloud records or schema from this application.
- Commit secrets, local schema exports, real record fixtures, or credential files.
- Expose privileged tokens to browser code or request write/admin scopes to make a read work.
- Add an unrestricted upstream proxy, silently truncate results, or label incomplete data as the entire table.
- Disable failing checks, delete regression tests to obtain a pass, or modify vendor/generated dependencies manually.

## Success Criteria

1. A documented local configuration connects to an existing hosted database with global read privileges. No user-level login or realm membership is needed to inspect the configured tables.
2. Every non-deleted table in the supplied schema is listed, including empty tables; navigation does not require changing application source code.
3. A supported-size selected table displays all returned records across realms, with 50 rows per display page and accurate loaded-result counts.
4. Custom primary keys, compound keys, heterogeneous fields, missing/null/empty values, nested values, typed JSON, and blob references remain inspectable without data loss.
5. A record inspector reveals every returned field, supports keyboard use, and preserves full cell values.
6. Refresh updates the view from the cloud; slow/stale requests cannot overwrite the currently selected table. Errors and oversize responses have clear recovery guidance.
7. Automated request assertions prove that all cloud data access is read-only and tokens request only the two approved scopes. Secret-leak and hostile-content checks pass.
8. Servers accept local access only; foreign-origin browser access and invalid Hosts are rejected, and record responses are not persistently cached.
9. All listed validation commands pass after scaffolding; the built app completes the same browsing workflow as development mode. The test-database smoke test verifies actual integration.
10. Setup documentation explains credentials, schema export, limits, startup, and troubleshooting without including real secrets or requiring a cloud mutation.

## Out of Scope (Deferred)

- Record creation, editing, deletion, and bulk operations — Phase 1 is inspection only.
- Schema editing, migrations, and table creation — unnecessary for read-only browsing.
- User, role, membership, or realm administration — inspect supplied tables only.
- Advanced filtering, sorting, query builders, and cross-table joins — separate browsing enhancements.
- Automatic metadata discovery — requires verification of a compatible official API.
- Large-table streaming/server pagination — requires a documented upstream strategy; Phase 1 has explicit limits.
- Multiple saved database profiles and connection switching — one configured database per process initially.
- Shared hosting, administrator accounts, SSO, and team sessions — local deployment is confirmed.
- Live synchronization, offline access, and persistent caching — manual fetch/refresh suffices.
- Import/export UI, binary downloads/previews, and collaborative-document decoding — beyond table/record inspection.
- Self-hosted Dexie Cloud servers and native desktop packaging — hosted databases in a local browser app first.

## Review Decisions

The user approved this specification on 2026-11-19 and explicitly confirmed:

1. Supplying a schema export during local setup is acceptable for Phase 1.
2. Limits of 10,000 records and 10 MiB per table are sufficient for Phase 1.

No specification questions remain open. The next gated artifact is the technical implementation plan; specification approval does not waive the plan and task review gates.
