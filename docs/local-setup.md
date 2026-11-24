# Local setup and troubleshooting

## Existing database and credentials

Use an existing hosted HTTPS database such as `https://your-db.dexie.cloud` and an existing client allowed to request `ACCESS_DB` and `GLOBAL_READ`. No end-user login, impersonation, or realm membership is used by this explorer. Obtaining/provisioning credentials is an administrator task outside this application.

From the repository root, copy `.env.example` to `.env` only if you have not configured it already. Fill in these names locally:

| Variable              | Value                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `DEXIE_DATABASE_URL`  | Hosted database origin, without a path, custom port, embedded credentials, query, or fragment   |
| `DEXIE_CLIENT_ID`     | Existing client ID                                                                              |
| `DEXIE_CLIENT_SECRET` | Existing client secret                                                                          |
| `DEXIE_SCHEMA_PATH`   | Schema export path, usually `./local/schema.json`; relative to the repository working directory |

Bun loads `.env` on startup; explicit environment variables take precedence. Do not put credentials in `VITE_*`, browser code, commands pasted into chat, screenshots, or Git. `.env*` (except the example), `local/`, `*.key`, `*-schema.json`, and `dexie-cloud.json` are ignored. Store local exports under `local/` even if their names do not match an ignore pattern.

## Schema export

In an administrator's existing Dexie CLI workspace that is already connected to the intended database, export **schema only**:

```sh
npx dexie-cloud export --schema
```

The CLI is a separate administrator setup tool whose documented prerequisite is Node.js. The explorer itself and its build/test tools run under Bun. Follow the [official CLI export instructions](https://dexie.org/docs/cloud/cli#export) to locate the generated export, then copy that schema-only JSON to this repository's `local/schema.json`. No record export, remote database creation, import, or data seeding is needed.

The backend expects the export's top-level `schema` object. For example, synthetic metadata looks like:

```json
{
  "schema": {
    "items": "@key, realmId, owner",
    "roles": "[realmId+name]",
    "removed": null
  }
}
```

Deleted entries (`null`) are omitted. Empty tables and access-control tables remain listed when present in the schema; records are not used to discover tables. Custom, compound, and dotted key definitions are supported. Re-export and restart after schema changes. A stale export can list a table the server no longer recognizes.

## Startup and reading

Install the pinned Bun 1.4.5 runtime, run `bun install --frozen-lockfile`, then `bun run dev`. Open `http://127.0.0.1:5173` using that exact loopback address. Vite proxies `/api/` to port 3001. Ctrl+C closes both servers. Development uses Vite's normal source-watching behavior; restart after backend/configuration/schema changes.

For the built workflow, stop development, run `bun run build`, then `bun run start`, and open `http://127.0.0.1:3001`. The build type-checks the server and browser, emits frontend JS/CSS, and bundles the server. Run from the repository root so `.env` and relative schema paths resolve consistently. Both commands use strict fixed ports and loopback binding.

“Configured” confirms local configuration/schema validation only. Selecting a table makes the authenticated read. All returned realms are included; pagination is a view of the complete loaded array. The inspector preserves all properties, typed JSON markers, and blob-reference metadata as text. It makes no extra record or binary request. Refresh resets the display page and inspector, and releases the previous result before reading again.

Each table must fit **10,000 records** and **10 MiB (10,485,760 response bytes)**. Both exact boundaries are accepted; excess fails without a partial display. Data requests have a 30-second deadline through response consumption. Token acquisition has its own 30-second deadline and 64 KiB budget. Tokens are retained in backend memory until renewal/restart; record results live only in browser memory and are released when replaced or the page closes. There is no persistent record cache or synchronization engine.

## Troubleshooting

| Symptom                                                   | Recovery                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Database setup required                                   | Set all four configuration values; verify the schema file and permissions; restart                                       |
| Invalid schema export                                     | Supply JSON with a valid `schema` map and supported primary-key definitions; re-export if necessary                      |
| Local API unavailable                                     | Run `bun run dev` from the repository root and check that ports 3001/5173 are free                                       |
| Startup fails / port occupied                             | Stop the existing app; do not start dev and built modes together                                                         |
| “Run bun run build before bun run start” / missing bundle | Run `bun run build` successfully before `bun run start`                                                                  |
| Authentication failure                                    | Check local client credentials for the intended database, then restart                                                   |
| Permission failure                                        | Ask the database administrator to verify the existing client's read permissions; do not add write/management scopes      |
| Timeout/network failure                                   | Check connectivity to the configured host and use Retry records or Refresh table                                         |
| Unsupported table size                                    | Choose a supported-size table; Phase 1 does not support larger tables or silently truncate them                          |
| Table is missing/unavailable                              | Re-export the schema, verify the selected database, and restart                                                          |
| Forbidden / foreign origin                                | Use the documented `127.0.0.1` URL and matching mode/port; the API intentionally rejects other browser origins and Hosts |
| Unexpected upstream response                              | Check server/protocol compatibility; raw upstream details are intentionally withheld from browser errors                 |

An upstream 422 saying a table's primary key is unknown indicates that the supplied schema entry is not registered for that hosted database. The app safely reports an invalid response. Re-export a matching schema-only file and restart; do not import or create remote schema merely to make an inspection request pass. During acceptance testing, two reserved-name metadata entries produced this response while the configured server's other seven tables were readable. The detailed evidence is in [validation](validation.md).

The explorer uses the documented [Dexie REST API](https://dexie.org/docs/cloud/rest-api): credential token acquisition and complete selected-table reads. Upstream credential-bearing redirects are refused. A failed refresh removes old data and its timestamp; successful retry requires no restart unless local configuration changed.

## Final integration check

Use an existing test database with known records in at least two realms and a matching schema export. Exercise built startup, table selection, paging where applicable, inspection, Refresh, and an empty table. Record only aggregate evidence and sanitized outcomes in `docs/validation.md`; never save real record bodies or tokens as fixtures or browser traces. Verify token-response shape and millisecond expiry without recording token material. The app must issue only token acquisition and read requests. Remote creation, seeding, client provisioning, and schema changes require separate authorization and are not part of this check.
