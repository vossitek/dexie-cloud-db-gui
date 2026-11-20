import { defineConfig, devices } from '@playwright/test';
const built = process.env.DEXIE_E2E_MODE === 'built';
const origin = built ? 'http://127.0.0.1:3001' : 'http://127.0.0.1:5173';

// https://playwright.dev/docs/test-webserver
export default defineConfig({
  testDir: './e2e',
  // These module-level state probes require Svelte's development compilation.
  // The same races are also covered by UI tests in both server modes.
  testIgnore: built ? ['**/explorer-state.spec.ts'] : [],
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: origin,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: {
    command: 'bun --no-env-file e2e/server.ts',
    url: `${origin}/api/status`,
    reuseExistingServer: false,
    timeout: 20_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
