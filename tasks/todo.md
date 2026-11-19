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

- [ ] Task complete
- **Description:** Wire sanitized setup/status/table-metadata routes into the browser and document local configuration names.
- **Acceptance:** Missing or invalid configuration yields actionable UI states without upstream calls; valid setup displays the configured database without claiming it has connected; environment files, local exports, and key files are ignored.
- **Verify:** `bun test ./tests/http.test.ts`; `bun run check`; `bun run build`; inspect valid/missing setup using separate loopback Vite/API processes until the supervisor lands in task 16.
- **Dependencies:** 05.
- **Files:** `server/http.ts`, `src/App.svelte`, `.env.example`, `.gitignore`, `tests/http.test.ts`.
- **Scope:** Medium.

This task is split into the following increments to retain the five-file scope limit:

- [x] Setup API: `server/http.ts`, `server/index.ts`, `shared/contracts.ts`, `tests/http.test.ts`, `tests/request-guard.test.ts`. Verify status/metadata, safe errors, startup loading, and absence of upstream calls. Evidence: 76 tests pass; status/metadata payloads exclude credentials, setup endpoints make zero cloud calls, and the Bun entry point loads configuration at startup. Strict checks, lint, and build pass.
- [ ] Local configuration template: `.env.example`, `.gitignore`. Verify that local environments, schema exports, and keys are ignored while the template remains trackable.
- [ ] Browser setup status: `src/lib/api.ts`, `src/App.svelte`, `tests/api.test.ts`. Verify response validation and render missing/invalid/configured/unavailable states through the real local API.

### Checkpoint B — Safe setup

- [ ] Setup/schema and request-boundary tests pass, including bad-input and foreign-origin cases.
- [ ] Missing, invalid, and valid local setup states are visible; invalid setup triggers no upstream request.
- [ ] Human reviews the checkpoint before proceeding.

## 07 — Obtain read-only cloud tokens

- [ ] Task complete
- **Description:** Implement bounded, validated token acquisition and in-memory renewal through an injected fetch boundary.
- **Acceptance:** Request only `ACCESS_DB`/`GLOBAL_READ`; validate token/expiry and coalesce renewal; sanitize authentication errors and refuse credential-bearing redirects.
- **Verify:** `bun test ./tests/auth.test.ts`; cover malformed responses, expiry units from the documented protocol, concurrent requests, redirects, and absence of secrets in returned errors; `bun run check`.
- **Dependencies:** 05–06.
- **Files:** `server/auth.ts`, `tests/auth.test.ts`.
- **Scope:** Small.

## 08 — Bound upstream response consumption

- [ ] Task complete
- **Description:** Read upstream responses with byte, record, cancellation, and deadline limits before publishing data.
- **Acceptance:** Accept exactly 10 MiB and 10,000 records; reject either excess without returning a partial result; preserve typed JSON and terminate stalled/cancelled reads.
- **Verify:** `bun test ./tests/read-response.test.ts`; test chunked/no-content-length responses, multibyte text, invalid JSON/shape, boundary and over-boundary results, and timeout during body consumption; `bun run check`.
- **Dependencies:** 05.
- **Files:** `server/read-response.ts`, `tests/read-response.test.ts`.
- **Scope:** Small.

## 09 — Serve complete selected-table reads

- [ ] Task complete
- **Description:** Connect authenticated bounded reads to the local records endpoint.
- **Acceptance:** Allowlisted table selection calls only encoded `GET /all/<table>` with no realm filter; expired-token reads retry authentication at most once; return complete records/timestamp or a sanitized typed error.
- **Verify:** `bun test ./tests/dexie.test.ts ./tests/http.test.ts`; assert exact methods/scopes/paths, two-realm fixtures, 401 versus 403 handling, timeout, abort, size failures, no-store, and no data mutations; `bun run check`.
- **Dependencies:** 07–08.
- **Files:** `server/dexie.ts`, `server/http.ts`, `tests/dexie.test.ts`, `tests/http.test.ts`.
- **Scope:** Medium.

### Checkpoint C — Read-only integration boundary

- [ ] All backend tests pass; exact size limits, scope restrictions, safe paths, cancellation, and secret redaction have evidence.
- [ ] A local records request works against the injected upstream fixture; no cloud credentials or resources were created.
- [ ] Human reviews the checkpoint before proceeding.

## 10 — Exercise the local app in a browser harness

- [ ] Task complete
- **Description:** Configure Playwright and a deterministic local app server using injected upstream responses.
- **Acceptance:** Browser tests exercise the actual backend handlers; synthetic fixtures cover heterogeneous/multi-realm data without real records; the Chromium command runs under Bun with no test-only bypass added to production configuration.
- **Verify:** `bun run test:e2e -- --project=chromium e2e/smoke.spec.ts`; `bun run check`. Browser binary installation may be required once.
- **Dependencies:** 09.
- **Files:** `playwright.config.ts`, `e2e/server.ts`, `e2e/fixtures.ts`, `e2e/smoke.spec.ts`, `package.json`.
- **Scope:** Medium.

## 11 — Navigate configured tables

- [ ] Task complete
- **Description:** Add the validated browser API client and searchable table sidebar.
- **Acceptance:** List every configured non-deleted table alphabetically, including empty/access-control tables; filtering changes navigation only; selection identifies its key definition and distinguishes an empty schema from setup failure.
- **Verify:** `bun test ./tests/api.test.ts`; `bun run test:e2e -- --project=chromium e2e/navigation.spec.ts`; `bun run check`.
- **Dependencies:** 10.
- **Files:** `src/lib/api.ts`, `src/components/TableList.svelte`, `src/App.svelte`, `tests/api.test.ts`, `e2e/navigation.spec.ts`.
- **Scope:** Medium.

## 12 — Derive lossless record presentation

- [ ] Task complete
- **Description:** Define record-column, value-preview, and page calculations independently of UI rendering.
- **Acceptance:** Union fields across all loaded records with key roots first; distinguish missing/null/empty/zero/false; preserve nested/typed/blob-reference source values and handle unusual own-property names safely.
- **Verify:** `bun test ./tests/records.test.ts`; include heterogeneous records, compound/dotted keys, long strings, page edges, typed values, and `__proto__`-like field names; `bun run check`.
- **Dependencies:** 11.
- **Files:** `src/lib/records.ts`, `tests/records.test.ts`.
- **Scope:** Small.

### Checkpoint D — Navigation

- [ ] Browser harness, navigation, API-validation, and presentation tests pass.
- [ ] Empty schema, table filtering, selected table identity, and configured-but-not-connected status are clear in the UI.
- [ ] Human reviews the checkpoint before proceeding.

## 13 — Browse records in display pages

- [ ] Task complete
- **Description:** Render the selected table's complete loaded result as an accessible record table.
- **Acceptance:** Show 50 rows per display page, accurate count/page state, key-first columns, and successful-fetch time; support empty/error/loading states; compact/truncated cells retain the full underlying values.
- **Verify:** `bun run test:e2e -- --project=chromium e2e/records.spec.ts`; include 0/1/50/51 records, late-appearing fields, multi-realm values, hostile strings, and horizontal scrolling; `bun run check`; `bun run build`.
- **Dependencies:** 12.
- **Files:** `src/components/RecordTable.svelte`, `src/App.svelte`, `src/styles.css`, `e2e/records.spec.ts`.
- **Scope:** Medium.

## 14 — Inspect a complete record

- [ ] Task complete
- **Description:** Add the keyboard-accessible record inspector without another data fetch.
- **Acceptance:** Reveal all returned properties and full values with readable nested/typed JSON; never download blobs or execute stored content; close accessibly and restore focus to the opening control.
- **Verify:** `bun run test:e2e -- --project=chromium e2e/inspector.spec.ts`; verify nested/long values, owner/realmId, keyboard focus, hostile content, and no extra upstream requests; `bun run check`.
- **Dependencies:** 13.
- **Files:** `src/components/RecordInspector.svelte`, `src/components/JsonValue.svelte`, `src/App.svelte`, `e2e/inspector.spec.ts`.
- **Scope:** Medium.

## 15 — Refresh without stale results

- [ ] Task complete
- **Description:** Consolidate request ownership so selection, refresh, retry, paging, and inspector state remain consistent.
- **Acceptance:** Abort/release old results on selection; refresh resets paging and inspection; late responses/errors cannot replace newer state or timestamps, and failures never label stale data current.
- **Verify:** `bun run test:e2e -- --project=chromium e2e/refresh.spec.ts`; inject delayed/out-of-order results, authentication/permission errors, oversize failures, and retry recovery; `bun run check`.
- **Dependencies:** 14.
- **Files:** `src/lib/explorer-state.svelte.ts`, `src/lib/api.ts`, `src/App.svelte`, `e2e/refresh.spec.ts`.
- **Scope:** Medium.

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
