# Tasks: Dexie Cloud Database GUI — Phase 1

Status: approved — user approved the plan and task list on 2026-11-19; implementation in progress.

Source: [specification](../spec/SPEC.md) · [implementation plan](plan.md).

Execute sequentially through the approved checkpoints. Each behavior change starts with its focused failing test. File lists are estimates capped at five per task; if implementation needs more, split the task rather than silently expanding it. The task/checkpoint status updates in this file are bookkeeping, not additional application scope.

## 01 — Establish the pinned toolchain

- [x] Task complete
- **Evidence:** Installed the exact approved pins on Bun 1.4.5; frozen install passed without changes. Vite 8.3.8, TypeScript 6.0.3, svelte-check 4.7.8, ESLint 10.15.0, Prettier 3.10.1, and Playwright 1.65.1 entry points ran explicitly under Bun. Runtime behavior/build validation follows in tasks 02–03.
- **Description:** Create the minimal package and strict TypeScript/Svelte configuration using the plan's exact dependencies and Bun runtime.
- **Acceptance:** Exact direct pins and `packageManager` are recorded; a frozen install reproduces the lockfile; tool entry points can run explicitly under Bun.
- **Verify:** `bun install`, then `bun install --frozen-lockfile`; `bun run --bun vite --version`; `bun run --bun tsc --version`; `bun run --bun svelte-check --version`. No application behavior test is needed yet.
- **Dependencies:** None.
- **Files:** `package.json`, `bun.lock`, `tsconfig.json`, `svelte.config.js`.
- **Scope:** Medium. This initial scaffold becomes runnable with task 02.

## 02 — Display the browser shell

- [x] Task complete
- **Evidence:** Vite production build and strict Svelte/tools checks pass. Isolated Chromium rendered the shell without console errors/warnings; widths 320/768/1024/1440 had no page overflow, and Tab focused the skip link. Desktop/mobile screenshots were visually reviewed. The default headless-shell capture timed out; the full Chromium channel completed screenshots under Bun and will be used for browser checks.
- **Description:** Add the smallest Svelte/Vite entry point and a usable application shell with placeholders for navigation and records.
- **Acceptance:** Vite binds to loopback with a strict port; the UI builds under Bun; the page has a semantic landmark layout and shared visual tokens.
- **Verify:** `bun run --bun vite build`; run `bun run --bun vite --host 127.0.0.1 --port 5173 --strictPort` and inspect the shell in a browser.
- **Dependencies:** 01.
- **Files:** `vite.config.ts`, `index.html`, `src/main.ts`, `src/App.svelte`, `src/styles.css`.
- **Scope:** Medium.

## 03 — Establish static quality checks

### Configuration subtask — Separate runtime type contexts

- [x] Subtask complete
- **Evidence:** Svelte check passes with zero errors/warnings and the tools TypeScript check passes without `skipLibCheck`. Browser types include Svelte/Vite; server/tooling types include Bun. Enabled JavaScript checking per the official Vite Svelte template so static `.svelte` components are checked correctly.
- **Reason:** The first real Svelte check reproduced incompatible ambient declarations when `bun` and `vite/client` types were loaded in one context. Split browser versus server/tooling configuration; retain declaration checking, strict options, and all approved source coverage.
- **Verify:** `bun run --bun svelte-check --tsconfig ./tsconfig.json --fail-on-warnings`; `bun run --bun tsc --project tsconfig.tools.json --noEmit`.
- **Files:** `tsconfig.json`, `tsconfig.tools.json`.
- **Scope:** Small. Perform this configuration correction before completing the shell's static verification. No change to the approved dependencies or quality bar.

### Static quality checks

- [x] Task complete
- **Evidence:** `bun run check` (zero Svelte errors/warnings plus tools TypeScript), `bun run lint`, `bun run format:check`, and `bun run build` pass. `bun run dev` serves the shell at `http://127.0.0.1:5173/`. Native `bun audit --json` returned no advisories. Dependency lifecycle-script inspection found none; an explicit empty `trustedDependencies` policy is recorded in manifest/lockfile, and a clean frozen install in a temporary directory passed. Static/configuration work has no unit-test suite yet; behavior tests begin at task 04.
- **Description:** Configure strict Svelte/TypeScript checking, ESLint, and Prettier for application and test sources.
- **Acceptance:** `check`, `lint`, `format:check`, and the initial build/dev script interfaces work; checks include server/shared sources when added; existing skill files are not reformatted or linted as application code.
- **Verify:** `bun run check`; `bun run lint`; `bun run format:check`; `bun run build`. Verify all tool processes use Bun.
- **Dependencies:** 02.
- **Files:** `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `package.json`, `bun.lock`. TypeScript changes are tracked in the separate configuration subtask above.
- **Scope:** Medium.

### Formatting subtask — Normalize approved document spacing

- [x] Subtask complete
- **Evidence:** Prettier normalized Markdown table spacing and separator widths in `spec/SPEC.md` and `tasks/plan.md`. A comparison normalizing whitespace and table-separator widths confirmed that their content did not change.
- **Files:** `spec/SPEC.md`, `tasks/plan.md`.
- **Scope:** Small; separate formatting-only commit.

### Checkpoint A — Foundation

- [x] Toolchain checks and the shell build pass; no application dependency/runtime compatibility issue remains unexplained.
- [x] Browser shell is usable and application changes exclude existing local skill configuration.
- [x] Human reviews the checkpoint before proceeding — approved by the user on 2026-11-19.

**Review state:** Tasks 01–03 and checkpoint A are approved; tasks 04–06 are authorized next. Desktop/mobile captures are available at `/tmp/dexie-foundation-desktop.png` and `/tmp/dexie-foundation-mobile.png`. Browser smoke checks used isolated Chromium via Playwright on Bun; Chrome DevTools MCP is unavailable. This is foundation evidence, not final accessibility, cross-browser, or cloud-integration acceptance.

## 04 — Establish the local request boundary

- [x] Task complete
- **Evidence:** 25 request-boundary tests pass after an initial failing run. Live direct/proxied requests return the expected 404/403 responses and `no-store` headers. Foreign Host/Origin, invalid Fetch Metadata, forwarded-header spoofing, and mutation methods are covered. Inverting the Host allowlist guard caused the suite to fail; the source was restored. Strict checks, lint, and build pass.
- **Description:** Add the Bun HTTP entry point and enforce local access before routing any API request.
- **Acceptance:** Bind only to `127.0.0.1`; validate Host and browser-origin context for direct/proxied requests; allow only explicit GET routes with no-store JSON errors and no permissive CORS.
- **Verify:** `bun test ./tests/request-guard.test.ts`; include foreign Origin, invalid Host, cross-site Fetch Metadata, wrong methods, unknown routes, and development-proxy cases; `bun run check`.
- **Dependencies:** 03.
- **Files:** `server/index.ts`, `server/http.ts`, `server/request-guard.ts`, `tests/request-guard.test.ts`, `vite.config.ts`.
- **Scope:** Medium.

## 05 — Validate local configuration and schema

- [x] Task complete
- **Evidence:** 66 tests pass across request-boundary, configuration, and schema suites. Missing settings/unsupported URLs stop before file access; schema/file errors are sanitized. Tests cover deleted/empty tables, custom/compound/dotted/Unicode keys, prototype-like table names, and the approved limits. Valid Dexie hidden/auto-increment metadata is retained for inspection. Schema cases are wrapped as data rows so an empty array is not mistaken for a test callback argument list.
- **Description:** Parse the explicit environment variables and local schema export into safe shared metadata.
- **Acceptance:** Reject invalid hosted URLs/credentials/schema entries before any upstream request; support empty, deleted, custom, compound, and dotted-key schemas; keep original key definitions and sorted table metadata without assuming `id`.
- **Verify:** `bun test ./tests/config.test.ts ./tests/schema.test.ts`; assert exact row/byte constants in the contract; `bun run check`.
- **Dependencies:** 04.
- **Files:** `server/config.ts`, `server/schema.ts`, `shared/contracts.ts`, `tests/config.test.ts`, `tests/schema.test.ts`.
- **Scope:** Medium.

## 06 — Show connection setup status

- [x] Task complete
- **Evidence:** All three setup increments and the static-file safeguard below are complete. Full suite: 97 passing tests across six files; strict checks, lint, formatting, and build pass. Browser evidence covers missing/invalid/configured/unavailable setup through the actual local handlers; no cloud requests or real credentials were used. Validation mutations in URL and browser-response guards were detected by their tests and restored.
- **Description:** Wire sanitized setup/status/table-metadata routes into the browser and document local configuration names.
- **Acceptance:** Missing or invalid configuration yields actionable UI states without upstream calls; valid setup displays the configured database without claiming it has connected; environment files, local exports, and key files are ignored.
- **Verify:** `bun test ./tests/http.test.ts`; `bun run check`; `bun run build`; inspect valid/missing setup using separate loopback Vite/API processes until the supervisor lands in task 16.
- **Dependencies:** 05.
- **Files:** `server/http.ts`, `src/App.svelte`, `.env.example`, `.gitignore`, `tests/http.test.ts`.
- **Scope:** Medium.

This task is split into the following increments to retain the five-file scope limit:

- [x] Setup API: `server/http.ts`, `server/index.ts`, `shared/contracts.ts`, `tests/http.test.ts`, `tests/request-guard.test.ts`. Verify status/metadata, safe errors, startup loading, and absence of upstream calls. Evidence: 76 tests pass; status/metadata payloads exclude credentials, setup endpoints make zero cloud calls, and the Bun entry point loads configuration at startup. Strict checks, lint, and build pass.
- [x] Local configuration template: `.env.example`, `.gitignore`. Evidence: `git check-ignore` confirms local environments, schema exports, keys, and browser artifacts are ignored while `.env.example` remains trackable. The template contains no credentials and explains the current separate-terminal startup commands.
- [x] Browser setup status: `src/lib/api.ts`, `src/App.svelte`, `tests/api.test.ts`. Evidence: 89 tests pass; malformed replies and raw exception/error bodies are rejected. Isolated Chromium verified missing/invalid/configured/unavailable states against real local handlers, retry/keyboard access, no external browser requests, credential redaction, and no overflow at 320/768/1024/1440 pixels. Desktop/mobile screenshots were reviewed; configured status explicitly says cloud access is unverified.
- [x] Development file access: `vite.config.ts`, `tests/dev-server.test.ts`. A failing real HTTP test reproduced direct exposure of synthetic schema/configuration JSON. Eight regression checks now pass, covering static/raw/filesystem routes, public-directory bypass protection, preserved environment/key protections, and continued public-asset serving. Vite's default deny patterns are retained.

### Checkpoint B — Safe setup

- [x] Setup/schema and request-boundary tests pass, including bad-input and foreign-origin cases.
- [x] Missing, invalid, and valid local setup states are visible; invalid setup triggers no upstream request.
- [x] Human reviews the checkpoint before proceeding — approved by the user on 2026-11-19.

**Review state:** Tasks 04–06 and checkpoint B are approved; tasks 07–09 are complete. Checkpoint C was approved by the user on 2026-11-20; tasks 10–12 are authorized next. Synthetic browser captures: `/tmp/dexie-setup-missing.png`, `/tmp/dexie-setup-invalid.png`, `/tmp/dexie-setup-configured.png`, `/tmp/dexie-setup-unavailable.png`, and `/tmp/dexie-setup-mobile.png`. The disposable browser verification script is `/tmp/dexie-setup-smoke.ts`; permanent browser-suite setup remains task 10. No real cloud authentication or record fetch has been attempted.

## 07 — Obtain read-only cloud tokens

- [x] Task complete
- **Evidence:** 33 focused authentication tests pass; the full suite passes 130 tests across seven files with loopback socket access for the Vite regression tests. Strict checks, lint, formatting, and build pass. Tests cover exact read-only scopes, millisecond expiry, concurrent renewals, database isolation, stale-token invalidation, malformed/non-JSON replies, rejected credentials/permissions, redirects, sanitized transport failures, 64 KiB boundary/cancellation, and fetch/body deadlines. An inverted cache-expiry comparison was caught by the focused test and restored. Fresh-context adversarial review found no contract violations. Only injected upstream fixtures were used; production integration is task 09 and the real-cloud smoke test remains task 18.
- **Description:** Implement bounded, validated token acquisition and in-memory renewal through an injected fetch boundary.
- **Acceptance:** Request only `ACCESS_DB`/`GLOBAL_READ`; validate token/expiry and coalesce renewal; sanitize authentication errors and refuse credential-bearing redirects.
- **Verify:** `bun test ./tests/auth.test.ts`; cover malformed responses, expiry units from the documented protocol, concurrent requests, redirects, and absence of secrets in returned errors; `bun run check`.
- **Dependencies:** 05–06.
- **Files:** `server/auth.ts`, `tests/auth.test.ts`.
- **Scope:** Small.

## 08 — Bound upstream response consumption

- [x] Task complete
- **Evidence:** 44 focused response-consumption tests pass after failing tests for the reader and cancellation/deadline behavior. The full suite passes 174 tests across eight files with loopback socket access for the existing Vite regression tests; strict checks, lint, formatting, and build pass. Tests cover exact 10 MiB / 10,000-record boundaries, single/chunked excess, absent/misleading Content-Length, multibyte and malformed UTF-8, JSON/record validation, non-finite numbers, 20,000-level nesting, preserved Dexie typed envelopes/blob references and unusual own properties, sanitized stream failures, client aborts, upstream deadline signals, stalled bodies, and cleanup that rejects or never settles. A mutated inclusive byte-limit check failed all three exact-boundary cases; the implementation was restored and those tests passed again. Task 09 must pass the fetch's deadline/client signal through to this reader so the deadline covers both fetch and body consumption. Only synthetic response streams were used; no cloud calls were made.
- **Description:** Read upstream responses with byte, record, cancellation, and deadline limits before publishing data.
- **Acceptance:** Accept exactly 10 MiB and 10,000 records; reject either excess without returning a partial result; preserve typed JSON and terminate stalled/cancelled reads.
- **Verify:** `bun test ./tests/read-response.test.ts`; test chunked/no-content-length responses, multibyte text, invalid JSON/shape, boundary and over-boundary results, and timeout during body consumption; `bun run check`.
- **Dependencies:** 05.
- **Files:** `server/read-response.ts`, `tests/read-response.test.ts`.
- **Scope:** Small.

## 09 — Serve complete selected-table reads

- [x] Task complete
- **Evidence:** Both implementation slices below are complete. All 255 tests across nine files pass, including 38 cloud-client and 53 HTTP API tests; strict checks, lint, formatting, and build pass. The endpoint returns complete multi-realm records and successful-fetch timestamps, reuses tokens without caching records, maps sanitized errors to HTTP statuses, and preserves request/response safeguards. Known literal dot-segment and unencodable table names fail locally rather than normalizing into another upstream path. Deliberate mutations of renewal, allowlisting, and exact route matching were caught; the original sources were restored and focused tests passed again. Real loopback HTTP verifies successful reads and cancellation on client disconnect. The actual startup entry point returned a complete result after an 11-second injected upstream wait, confirming Bun's former 10-second idle cutoff no longer prevents the 30-second application deadline. Only synthetic fixtures were used; no cloud credentials or resources were created and no real cloud request was made.
- **Description:** Connect authenticated bounded reads to the local records endpoint.
- **Acceptance:** Allowlisted table selection calls only encoded `GET /all/<table>` with no realm filter; expired-token reads retry authentication at most once; return complete records/timestamp or a sanitized typed error.
- **Verify:** `bun test ./tests/dexie.test.ts ./tests/http.test.ts`; assert exact methods/scopes/paths, two-realm fixtures, 401 versus 403 handling, timeout, abort, size failures, no-store, and no data mutations; `bun run check`.
- **Dependencies:** 07–08.
- **Files:** `server/dexie.ts`, `server/http.ts`, `tests/dexie.test.ts`, `tests/http.test.ts`.
- **Scope:** Medium.

Implementation slices (each stays within the five-file limit):

- [x] Cloud client: `server/dexie.ts`, `tests/dexie.test.ts`. Evidence: 38 focused tests and all 212 existing/new tests pass. Exact scopes, methods and encoded paths, two-realm records, bounded 401 renewal, immediate 403 failure, redirect refusal, limits, fresh results, cancellation during shared renewal/fetch/body, and a deadline spanning fetch and body consumption are covered. Inverting the renewal guard failed its focused test; the source was restored. Only injected upstream fixtures were used.
- [x] Local endpoint: `server/http.ts`, `server/index.ts`, `tests/http.test.ts`, `tests/request-guard.test.ts`. Evidence: 53 API tests plus the existing 25 request-boundary tests pass. All handlers are awaited, local errors retain no-store/security headers, and unsupported names/parameters/methods/foreign origins never initiate cloud access. The Bun idle timeout is derived from the application deadline plus five seconds. Real loopback tests cover complete results and cancellation; the disposable actual-entry-point smoke script is `/tmp/dexie-task09-smoke.ts`.

### Checkpoint C — Read-only integration boundary

- [x] All backend tests pass; exact size limits, scope restrictions, safe paths, cancellation, and secret redaction have evidence.
- [x] A local records request works against the injected upstream fixture; no cloud credentials or resources were created.
- [x] Human reviews the checkpoint before proceeding — approved by the user on 2026-11-20.

**Review state:** Tasks 07–09 and checkpoint C are approved; tasks 10–12 are authorized next. Full backend test output is recorded at `/tmp/dexie-task09-tests.log`. Real-cloud protocol acceptance remains task 18.

## 10 — Exercise the local app in a browser harness

- [x] Task complete
- **Evidence:** Three Chromium smoke tests pass through the real Svelte/Vite app and local API under Bun, with no external browser requests or browser console errors/warnings. Injected upstream fixtures validate exact read-only token scopes and data paths and cover heterogeneous multi-realm records, typed/blob values, empty and missing tables. Isolated Chromium uses the full `chromium` channel established in task 02; no browser installation or Node fallback was needed. All 255 backend tests, strict checks, lint, formatting, and build pass. The harness disables environment-file loading, refuses to reuse an existing server, retains the production access guards, and shuts down both local servers. The setup screenshot was visually reviewed. Test-server setup variants are confined to `e2e/server.ts`; production configuration has no test switch. Record rendering remains task 13.
- **Description:** Configure Playwright and a deterministic local app server using injected upstream responses.
- **Acceptance:** Browser tests exercise the actual backend handlers; synthetic fixtures cover heterogeneous/multi-realm data without real records; the Chromium command runs under Bun with no test-only bypass added to production configuration.
- **Verify:** `bun run test:e2e -- --project=chromium e2e/smoke.spec.ts`; `bun run check`. Browser binary installation may be required once.
- **Dependencies:** 09.
- **Files:** `playwright.config.ts`, `e2e/server.ts`, `e2e/fixtures.ts`, `e2e/smoke.spec.ts`, `package.json`.
- **Scope:** Medium.

## 11 — Navigate configured tables

- [x] Task complete
- **Evidence:** 31 browser-client unit tests (including 18 new metadata cases) and all 273 backend/unit tests pass. Nine navigation tests plus three smoke tests pass in isolated Chromium through the real API. Evidence covers alphabetically ordered tables (including empty/access-control tables), compound/dotted key metadata, filtering that preserves selection, keyboard use, valid empty schemas, setup failure, metadata loading/failure/retry, and 320/768/1024/1440-pixel layouts without overflow. Desktop/mobile screenshots were visually reviewed; the normal browser console is clean. Strict checks, lint, formatting, and build pass. Disabling duplicate-name rejection failed its unit test; the original code was restored and the test passed again. Selection displays schema identity only; record fetching/rendering remains task 13.
- **Description:** Add the validated browser API client and searchable table sidebar.
- **Acceptance:** List every configured non-deleted table alphabetically, including empty/access-control tables; filtering changes navigation only; selection identifies its key definition and distinguishes an empty schema from setup failure.
- **Verify:** `bun test ./tests/api.test.ts`; `bun run test:e2e -- --project=chromium e2e/navigation.spec.ts`; `bun run check`.
- **Dependencies:** 10.
- **Files:** `src/lib/api.ts`, `src/components/TableList.svelte`, `src/App.svelte`, `tests/api.test.ts`, `e2e/navigation.spec.ts`.
- **Scope:** Medium.

Implementation slices: browser metadata client and tests (`src/lib/api.ts`, `tests/api.test.ts`), then navigation UI and Chromium verification (`src/components/TableList.svelte`, `src/App.svelte`, `e2e/navigation.spec.ts`, `e2e/smoke.spec.ts`). The existing smoke expectation will follow the new table-selection state.

## 12 — Derive lossless record presentation

- [x] Task complete
- **Evidence:** 37 focused presentation tests and all 310 unit/backend tests across ten files pass. Helpers union all own fields across the complete result, order compound/dotted key roots first, preserve unusual property names, label missing/null/empty/zero/false distinctly, and preview typed/blob/nested values without conversion or downloads. Unicode previews inspect at most 81 code points while retaining full source values; a 20,000-level nested fixture remains intact. Display-page tests cover 0/1/50/51/100/101 records, invalid/out-of-range page requests, and object identity. A floor-versus-ceiling mutation failed nine pagination cases; the original code was restored and the full suite passed. Strict checks, lint, formatting, and build pass. These helpers are ready for the task 13 record grid.
- **Description:** Define record-column, value-preview, and page calculations independently of UI rendering.
- **Acceptance:** Union fields across all loaded records with key roots first; distinguish missing/null/empty/zero/false; preserve nested/typed/blob-reference source values and handle unusual own-property names safely.
- **Verify:** `bun test ./tests/records.test.ts`; include heterogeneous records, compound/dotted keys, long strings, page edges, typed values, and `__proto__`-like field names; `bun run check`.
- **Dependencies:** 11.
- **Files:** `src/lib/records.ts`, `tests/records.test.ts`.
- **Scope:** Small.

### Checkpoint D — Navigation

- [x] Browser harness, navigation, API-validation, and presentation tests pass.
- [x] Empty schema, table filtering, selected table identity, and configured-but-not-connected status are clear in the UI.
- [x] Human reviews the checkpoint before proceeding — approved by the user on 2026-11-20.

**Review state:** Tasks 10–12 and checkpoint D are approved; tasks 13–15 are authorized next. All 12 Chromium tests and 310 unit/backend tests pass, with clean strict checks, lint, formatting, and build. Desktop/mobile navigation screenshots were reviewed under `test-results/`; test summaries are available at `/tmp/dexie-checkpoint-d-tests.log` and `/tmp/dexie-checkpoint-d-browser.log`. Tests used synthetic data only. The UI now selects tables and shows key metadata; record rendering remains task 13, with full inspection and refresh in tasks 14–15.

## 13 — Browse records in display pages

- [x] Task complete
- **Evidence:** All 333 unit/backend tests and 20 Chromium tests pass, including eight record-grid cases for 0/1/50/51 records, late columns, multi-realm values, hostile strings, loading/failure/retry, and keyboard-controlled horizontal scrolling at 320/1440 pixels. The browser client validates full records and canonical fetch timestamps, preserves typed/blob values, sanitizes errors, and accepts exactly 10,000 records. Selecting a table now fetches and renders its complete result; display paging makes no additional request. Desktop/mobile screenshots were reviewed; page overflow and normal browser console errors/warnings are absent. Native scroll buttons provide keyboard access without disabling Svelte accessibility checks. Strict checks, lint, formatting, and build pass. No real cloud requests were made during validation.
- **Description:** Render the selected table's complete loaded result as an accessible record table.
- **Acceptance:** Show 50 rows per display page, accurate count/page state, key-first columns, and successful-fetch time; support empty/error/loading states; compact/truncated cells retain the full underlying values.
- **Verify:** `bun run test:e2e -- --project=chromium e2e/records.spec.ts`; include 0/1/50/51 records, late-appearing fields, multi-realm values, hostile strings, and horizontal scrolling; `bun run check`; `bun run build`.
- **Dependencies:** 12.
- **Files:** `src/components/RecordTable.svelte`, `src/App.svelte`, `src/styles.css`, `e2e/records.spec.ts`.
- **Scope:** Medium.

Implementation slices (each stays within the five-file limit): browser record client and validation tests (`src/lib/api.ts`, `tests/api.test.ts`); synthetic record-count fixtures (`e2e/fixtures.ts`, `e2e/server.ts`); then the grid and selection integration (`src/components/RecordBrowser.svelte`, `src/components/RecordTable.svelte`, `src/App.svelte`, `src/styles.css`, `e2e/records.spec.ts`). The record browser owns loading/paging state so the application shell remains focused; task 15 will consolidate request ownership into the planned state module.

## 14 — Inspect a complete record

- [x] Task complete
- **Evidence:** Seven inspector Chromium cases pass: complete in-memory records with no extra data/blob requests, keyboard opening, both Tab-loop directions, Escape, opener-focus restoration, long/hostile/unusual own properties, a 20,000-level record beyond Chromium's native stringifier limit, page-two inspection without an id assumption, and 320/1440-pixel layouts. Six JSON formatter tests and all 339 unit/backend tests pass. The formatter preserves full values and uses a tested iterative fallback for native recursion limits; a boundary mutation was caught and restored. A native dialog supplies modality and Escape; explicit edge-of-dialog Tab handling fixes an observed Chromium focus escape. JSON is shown in a labeled read-only text field, never raw HTML. Desktop/mobile inspector captures were reviewed. Strict checks, lint, formatting, and build pass.
- **Description:** Add the keyboard-accessible record inspector without another data fetch.
- **Acceptance:** Reveal all returned properties and full values with readable nested/typed JSON; never download blobs or execute stored content; close accessibly and restore focus to the opening control.
- **Verify:** `bun run test:e2e -- --project=chromium e2e/inspector.spec.ts`; verify nested/long values, owner/realmId, keyboard focus, hostile content, and no extra upstream requests; `bun run check`.
- **Dependencies:** 13.
- **Files:** `src/components/RecordInspector.svelte`, `src/components/JsonValue.svelte`, `src/App.svelte`, `e2e/inspector.spec.ts`.
- **Scope:** Medium.

Implementation slices: a JSON display formatter and its unit tests (`src/lib/json.ts`, `tests/json.test.ts`), then the inspector and opening controls (`src/components/RecordInspector.svelte`, `src/components/JsonValue.svelte`, `src/components/RecordBrowser.svelte`, `src/components/RecordTable.svelte`, `e2e/inspector.spec.ts`). The inspector uses the selected in-memory record; no additional endpoint is added.

## 15 — Refresh without stale results

- [ ] Task complete
- **Description:** Consolidate request ownership so selection, refresh, retry, paging, and inspector state remain consistent.
- **Acceptance:** Abort/release old results on selection; refresh resets paging and inspection; late responses/errors cannot replace newer state or timestamps, and failures never label stale data current.
- **Verify:** `bun run test:e2e -- --project=chromium e2e/refresh.spec.ts`; inject delayed/out-of-order results, authentication/permission errors, oversize failures, and retry recovery; `bun run check`.
- **Dependencies:** 14.
- **Files:** `src/lib/explorer-state.svelte.ts`, `src/lib/api.ts`, `src/App.svelte`, `e2e/refresh.spec.ts`.
- **Scope:** Medium.

Implementation files: `src/lib/explorer-state.svelte.ts`, `src/components/RecordBrowser.svelte`, `e2e/refresh.spec.ts`, `e2e/explorer-state.spec.ts`, and `e2e/server.ts`. The browser client already landed with task 13. State tests run the real Svelte-compiled module in Chromium with controlled promises, including loaders that ignore cancellation; UI tests keep using the local handlers. The test server advances a synthetic fetch clock so fresh reads have distinguishable timestamps.

- [x] Configuration correction: `eslint.config.js` now applies the existing TypeScript parser to `.svelte.ts` rune modules as documented by eslint-plugin-svelte. The first lint run reproduced a JavaScript-parser syntax error on the new state module; extending the file mapping resolves it without disabling rules or excluding source. Full lint and strict type checks pass. This is a separate configuration-only increment.

### Checkpoint E — Complete browsing workflow

- [ ] Record paging, full inspection, focus handling, refresh, and request-race tests pass.
- [ ] Manually inspect the layout with wide/deep records and confirm there are no create/edit/delete controls.
- [ ] Human reviews the checkpoint before proceeding.

## 16 — Run the app through its final commands

- [ ] Task complete
- **Description:** Add the development supervisor and built static serving, completing the command contract.
- **Acceptance:** `dev` launches/stops both loopback processes cleanly; `build` validates the server entry point and emits frontend assets; `start` serves built assets/API safely from one origin, with no path traversal or API-to-HTML fallback.
- **Verify:** `bun test ./tests/static.test.ts`; `bun run build`; exercise `bun run dev` and `bun run start` separately, including origin checks and shutdown; `bun run check`.
- **Dependencies:** 15.
- **Files:** `server/static.ts`, `server/index.ts`, `scripts/dev.ts`, `package.json`, `tests/static.test.ts`.
- **Scope:** Medium.

## 17 — Verify security and accessible browser behavior

- [ ] Task complete
- **Description:** Exercise the assembled app's safety/accessibility properties and record cross-browser outcomes.
- **Acceptance:** Built and proxied modes enforce local browser access and never expose tokens or persist records; keyboard, labels, contrast, and focus meet the specified workflow; Firefox/Safari smoke results and meaningful regressions are recorded.
- **Verify:** `bun run test:e2e -- --project=chromium`; focused `e2e/security.spec.ts` and `e2e/accessibility.spec.ts`; manual Firefox/Safari and contrast inspection. Document any unavailable browser as an unverified criterion, not a pass.
- **Dependencies:** 16.
- **Files:** `e2e/security.spec.ts`, `e2e/accessibility.spec.ts`, `playwright.config.ts`, `docs/validation.md`.
- **Scope:** Medium. Split any remediation into its own focused task with its regression test.

## 18 — Document setup and collect final acceptance evidence

- [ ] Task complete
- **Description:** Finish setup/troubleshooting documentation and validate the read-only integration against an existing test cloud database.
- **Acceptance:** Docs explain credentials, schema export, restart, limits, and all commands; record protocol/expiry/multi-realm smoke evidence without secrets; map every spec success criterion to its evidence and leave any unmet criterion explicitly open.
- **Verify:** `bun install --frozen-lockfile`; `bun run check`; `bun run lint`; `bun run format:check`; `bun test ./tests`; `bun run test:e2e -- --project=chromium`; `bun run build`; smoke `bun run start` against a locally configured existing test database. Request missing configuration only when the app is concrete and ready to exercise; do not create/seed a remote database.
- **Dependencies:** 17.
- **Files:** `README.md`, `docs/local-setup.md`, `docs/validation.md`, `.env.example`.
- **Scope:** Medium.

### Checkpoint F — Phase 1 acceptance

- [ ] Full command suite passes, built workflow is verified, and security/accessibility review findings are resolved.
- [ ] Each of the ten spec success criteria has evidence, including required real-cloud and other-browser checks.
- [ ] No data writes, secret leaks, persistent record caches, or unapproved scope additions were introduced.
- [ ] Human reviews the completed Phase 1 result.
