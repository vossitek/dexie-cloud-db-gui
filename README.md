# Dexie Cloud database explorer

A local, read-only database explorer built with Bun, Svelte 5, and Vite. Select a table from a schema export, browse records across realms, and inspect complete JSON values. Each table read supports up to 10,000 records and 10 MiB; display pages contain 50 rows.

## Run locally

Use Bun **1.4.5**. From the repository root:

```sh
bun install --frozen-lockfile
```

If `.env` does not already exist, copy `.env.example` to `.env`. Set its four server-side configuration values using an existing database client with `ACCESS_DB` and `GLOBAL_READ` permission, and put a schema-only export in `local/schema.json`. See [local setup](docs/local-setup.md) for details.

```sh
bun run dev
```

Open **http://127.0.0.1:5173**. Ctrl+C stops Vite and the local API together. For the built app:

```sh
bun run build
bun run start
```

Open **http://127.0.0.1:3001**. Stop development before starting the built app. Configuration/schema changes require a restart; Refresh reloads records without restarting.

## Commands

| Command                                                       | Purpose                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `bun run dev`                                                 | Start Vite on loopback port 5173 and API on loopback port 3001                  |
| `bun run check`                                               | Strict Svelte/browser and server/tool/test type checks                          |
| `bun run lint`                                                | ESLint with zero warnings                                                       |
| `bun run format:check`                                        | Check formatting                                                                |
| `bun run format`                                              | Format repository application files and docs                                    |
| `bun test ./tests`                                            | Unit, HTTP, static-file and process lifecycle regression tests                  |
| `bun run test:e2e -- --project=chromium`                      | Synthetic browser workflow through the development proxy                        |
| `bun run build`                                               | Type-check, build frontend assets, bundle the Bun server                        |
| `DEXIE_E2E_MODE=built bun run test:e2e -- --project=chromium` | Same applicable browser workflow through built static/API handlers; build first |
| `bun run start`                                               | Run `dist/server.js`, serving built frontend and API                            |
| `bun audit --json`                                            | Audit the committed dependency graph                                            |

Browser tests use isolated full Chromium and injected upstream fixtures. If it is not installed, run `bun run --bun playwright install chromium`. Tests require loopback sockets and free ports 3001/5173; they do not reuse a running app or use real cloud credentials. Three direct Svelte-module race probes run in development mode; built-mode UI race tests still run.

## Design and limits

`server/` validates local configuration and browser requests, holds tokens only in process memory, and performs bounded reads. `shared/` defines the validated API contracts. `src/` renders the selected result in memory; it does not persist records, poll, synchronize, or fetch blob contents. `dist/server.js` and all local configuration are excluded from static serving. The app has no create/edit/delete actions.

The backend requests only the two read scopes above. Existing client credentials stay in `.env`, never in `VITE_*` variables. API responses use `no-store`; the built page enforces a local content security policy. Any process running as your local user can still access the loopback API, so use it on a trusted machine.

The [approved specification](spec/SPEC.md) and [plan](tasks/plan.md) record the design decisions. [Validation evidence and remaining acceptance checks](docs/validation.md) distinguish automated results from manual and real-cloud checks. Phase 1 acceptance remains open until that evidence is complete.
