# Phase 1 validation evidence

Validation date: **2026-11-20**. Checkpoint E is approved. Task 16 is complete; tasks 17–18 have the remaining manual/integration checks listed below. **Phase 1 and checkpoint F are not accepted yet.**

## Reproducible local checks

Run from the repository root with Bun 1.4.5. Stop other app/test servers before tests; ports 3001 and 5173 must be free. Process tests blank cloud settings and browser tests use synthetic upstream fixtures.

```sh
bun install --frozen-lockfile
bun run check
bun run lint
bun run format:check
bun test ./tests
bun run test:e2e -- --project=chromium
bun run build
DEXIE_E2E_MODE=built bun run test:e2e -- --project=chromium
bun audit --json
```

| Check                         | Recorded result                                                          |
| ----------------------------- | ------------------------------------------------------------------------ |
| Frozen install                | Pass; 161 installs checked, no manifest/lockfile change                  |
| Type checks                   | Pass; zero Svelte errors/warnings and strict server/tool/test TypeScript |
| Lint / formatting             | Pass                                                                     |
| Unit/backend/process tests    | 362 pass, 0 fail across 13 files                                         |
| Development Chromium suite    | 44 pass, 0 fail                                                          |
| Built Chromium suite          | 41 pass, 0 fail                                                          |
| Frontend and Bun server build | Pass; frontend assets plus `dist/server.js`                              |
| Native Bun dependency audit   | Pass; empty advisory object `{}`                                         |

Browser tests use Playwright 1.65.1's isolated full Chromium channel; the audit browser reports Chromium 159. Both browser modes exercise the real local API with an injected cloud transport. Built mode uses the emitted frontend and production static/API guards. Three direct Svelte-module state probes require Vite compilation and run only in development; UI stale-response tests run in both modes. Actual `bun run start` is separately exercised by process tests, including production-origin rejection. No fixture result is claimed as real-cloud evidence.

## Security and lifecycle review

The trust boundaries are the browser-to-loopback request, local configuration/schema files, built filesystem assets, and the authenticated upstream response. Assets are client credentials, privileged tokens, and returned records. Tests cover foreign-origin/Host spoofing, data mutation attempts, secret exposure, path traversal/symlink escape, malicious stored text, unbounded/stalled responses, and stale request publication.

- Built static serving exposes only `/`, `/index.html`, and emitted JS/CSS under `/assets/`. Private paths, the server bundle, source files, maps, encoded traversal, and symlink escapes return errors. Unknown API routes return JSON, never the app shell.
- API tests verify exact token scopes, allowed upstream methods/paths, one bounded expiry retry, sanitized failures, and inclusive byte/row limits. No browser route can choose an arbitrary upstream URL.
- Both direct and proxied API guards reject foreign Origin, `null` Origin, invalid Host, and cross-site Fetch Metadata. Vite rejects an invalid Host before proxying; the direct backend rejection also verifies `no-store`. A real different-origin fixture website cannot read the API through browser CORS.
- Browsing/refreshing sends only GET requests from the browser, never exposes the fixture token/client secret, and leaves local/session storage, IndexedDB, Cache Storage, and service-worker registrations empty. Record responses carry `Cache-Control: no-store`.
- SIGINT/SIGTERM release both development ports. Failure to bind either fixed port closes the other process. Built startup and shutdown use the single-origin port 3001 workflow.
- Review mutation: inverting the static request-origin guard made its focused suite fail. Restoring it returned all 18 static tests to green. Earlier task evidence covers token-renewal and stale-response mutations.

Local test summaries: `/tmp/dexie-final-tests.log`, `/tmp/dexie-task17-dev-browser.log`, `/tmp/dexie-task17-built-browser.log`, `/tmp/dexie-static-mutation.log`, and `/tmp/dexie-final-audit.json`. These temporary artifacts may not survive a machine cleanup; the automated checks above are the reproducible evidence.

## Accessibility review

The search input originally had a **1.31:1** boundary against white. A failing browser regression test confirmed it; its border now uses `#5b6879`, giving **5.67:1**. The permanent accessibility suite also checks skip-link focus, labeled search, keyboard selection, Enter/Space activation, visible focus, inspector modality/Escape/focus restoration, refresh status, forced colors, reduced motion, and a 640 CSS-pixel viewport representing reflow at 200% of a 1280-pixel viewport. This reflow test does not substitute for a native browser zoom or screen-reader test.

Temporary tools were installed outside the repository with lifecycle scripts disabled: `@axe-core/cli@4.13.0` and `pa11y@9.1.1`. Pa11y's CLI completed the setup audit with no issues. The axe CLI could not launch because its chromedriver binary was not installed; the same pinned **axe-core 4.13.0** engine was instead injected through isolated Playwright contexts. Audit-only contexts bypassed CSP for trusted checker injection; the normal browser security suites used the actual policy.

| Synthetic built-app state    | axe WCAG A/AA violations | Pa11y WCAG2AA issues |
| ---------------------------- | ------------------------ | -------------------- |
| Configured setup             | 0                        | 0                    |
| Loaded heterogeneous records | 0                        | 0                    |
| Record inspector             | 0                        | 0                    |
| Empty table                  | 0                        | 0                    |
| Missing configuration        | 0                        | 0                    |

Axe left contrast review items for decorative/arrow glyphs and cells obscured by the sticky inspector column. Computed colors and screenshots were inspected: text against white is **14.67:1**, text against the table header is **13.05:1**, muted text is **5.67:1**, the decorative accent is **6.29:1**, and the accent badge is **5.60:1**. Arrow controls have accessible names. Keyboard activation of the horizontal scroll buttons reveals the obscured columns; full values also remain available in the inspector. Screenshots of records, inspector and scrolled content were visually reviewed.

Reports: `/tmp/dexie-accessibility-summary.json`, `/tmp/dexie-axe-{state}.json`, `/tmp/dexie-pa11y-{state}.json`. Disposable audit script: `/tmp/dexie-accessibility-audit.ts`. Synthetic visual captures: `/tmp/dexie-final-{state}.png`, `/tmp/dexie-final-scrolled.png`, plus the browser suite's reflow/forced-color captures.

## Manual browser and assistive-technology checks still open

| Required check     | Outcome / remaining work                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current Firefox    | Not installed; manual workflow unverified                                                                                                                       |
| Current Safari     | Safari 27.2 is present; isolated WebDriver session refused because “Allow remote automation” is disabled. Settings were not changed. Manual workflow unverified |
| VoiceOver + Safari | Not exercised; heading/landmark navigation, control names, and loading/error announcements require a listening check                                            |
| Native 200% zoom   | Automated equivalent reflow passes; native zoom inspection remains manual                                                                                       |

For manual checks without any cloud access, stop the app and run `bun --no-env-file e2e/server.ts`, then open `http://127.0.0.1:5173` in the named browser. For built mode, build first and run `DEXIE_E2E_MODE=built bun --no-env-file e2e/server.ts`, then open `http://127.0.0.1:3001`. These are test-only servers using synthetic data. Ctrl+C stops them.

Record the actual browser version and result after checking table filtering/selection, empty tables, all record fields, horizontal scrolling, inspector open/close/focus, Refresh, keyboard order/focus visibility, and 200% zoom. With VoiceOver, check headings, landmarks, table/control names, dialog labeling, and live loading/error announcements. Error/retry may be exercised with the synthetic browser tests; do not mistake visual presence of a live region for verified spoken output.

## Real-cloud smoke check — completed with schema mismatch

The user confirmed on **2026-11-20** that the existing local configuration targets the intended test database. The built application was started with `bun run start` against that configuration. No credentials, tokens, real record bodies, screenshots, or browser traces were retained.

The main protocol-observed run used the same `dist/server.js` artifact with a disposable external preload observer. It failed closed on any operation beyond exact `POST /token` and schema-allowlisted `GET /all/<encodedTable>` requests with redirects disabled. The observer confirmed:

- One token request with exactly `ACCESS_DB` and `GLOBAL_READ`, client-credentials grant, and no impersonation claims.
- A token response with `type: tokens`, a string token, and a future integer expiry in milliseconds. Token material remained in memory.
- Twelve table reads, zero blocked/unexpected requests, and no upstream data mutations. Supplemental diagnosis and recovery checks also used only token acquisition and reads.
- All nine configured entries were listed. Seven table reads succeeded: three nonempty results (2, 1, and 15 records) and four empty results. Two successful results contained explicit records from two distinct realms.

Isolated Chromium **159.0.8154.6** verified the built UI against the real database: a 15-record multi-realm result, exact first-page row count, complete JSON inspector equality with the loaded record, Escape/focus restoration, no inspector fetch, fresh Refresh response/timestamp, and an empty-table state. There were zero console/page problems, zero external browser requests, and zero browser mutations. This dataset did not provide more than 50 records in a selected table; pagination remains covered by synthetic browser evidence.

Two reserved-name local schema entries, `$$baseRevs` and `$$logins`, returned upstream **HTTP 422**, with small HTML error responses indicating that the server does not know their primary-key definitions. They were rejected as `INVALID_RESPONSE`; no partial or fabricated records were shown. The returned instruction to sync/import a schema was not executed, since this task authorizes no cloud/schema mutation. The observed cause is a mismatch between those local metadata entries and the server's known tables, rather than a token, JSON preservation, or browser-rendering failure.

A separate recovery check used the actual `bun run start` command and verified both failure states, removal of stale rows/timestamps, and recovery to a supported table after each. These checks passed twice without a restart. The existing local schema and cloud schema were left unchanged. Supply a schema-only export matching the configured server before claiming all configured entries are readable; do not silently filter entries or create remote schema definitions to obtain a pass.

Only sanitized aggregates were written to `/tmp/dexie-real-cloud-summary.json`, `/tmp/dexie-real-cloud-protocol-summary.json`, `/tmp/dexie-cloud-diagnostic-summary.json`, and `/tmp/dexie-cloud-recovery-summary.json`. Disposable checks: `/tmp/dexie-real-cloud-smoke.ts`, `/tmp/dexie-cloud-observer.ts`, `/tmp/dexie-cloud-diagnose.ts`, and `/tmp/dexie-cloud-error-recovery.ts`. All app/browser processes created by these checks were stopped. These temporary files are not required to run the application.

The live protocol and supported-table workflow are verified. The schema mismatch and previously listed manual browser/accessibility checks remain open for final acceptance.

## Specification success criteria

| Criterion                                                          | Evidence                                                                                             | Status                                                                            |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1. Existing hosted database/global read connection                 | Local setup/configuration tests; built real-cloud authentication/read smoke; setup docs              | Live authentication/global reads pass                                             |
| 2. Every non-deleted schema table, including empty                 | Schema unit tests and navigation browser suite in both modes                                         | Automated pass                                                                    |
| 3. Complete supported-size multi-realm reads, 50-row paging        | Response/API boundary tests; 0/1/50/51-row browser cases; exact 10,000-row/10 MiB backend cases      | Synthetic boundaries/paging and real multi-realm reads pass                       |
| 4. Custom/compound keys and heterogeneous/typed/blob values        | Schema/record/JSON unit tests; records and inspector browser suites; 20,000-level input              | Automated pass                                                                    |
| 5. Complete keyboard-accessible inspector                          | Inspector/accessibility suites and synthetic visual review                                           | Automated pass; manual browser/AT checks open                                     |
| 6. Refresh, race safety, clear failures/recovery                   | Controlled Svelte race tests, delayed table-switch UI tests, five error/retry scenarios              | Automated pass                                                                    |
| 7. Read-only protocol, no token leaks, hostile text inert          | Authentication/data/API tests; browser security/inspector suites                                     | Automated pass                                                                    |
| 8. Local-only access, no persistent record cache                   | Guard/static/process tests; browser storage/CORS/no-store checks in both modes                       | Automated pass                                                                    |
| 9. Full commands and equivalent built workflow, actual integration | Command tests; development/built Chromium suites; strict checks/build                                | Local and supported cloud workflow pass; schema mismatch and manual browsers open |
| 10. Complete setup/troubleshooting docs without secrets/mutations  | `README.md`, `docs/local-setup.md`, `.env.example`, reviewed against code and official CLI/REST docs | Complete                                                                          |

Checkpoint F remains open until the schema mismatch, manual browser/accessibility evidence above, and final human review are resolved. No verification threshold, required browser, or cloud criterion has been waived.
