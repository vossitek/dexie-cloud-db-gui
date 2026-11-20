import { defineConfig, devices } from '@playwright/test';

// https://playwright.dev/docs/test-webserver
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
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
    url: 'http://127.0.0.1:5173/api/status',
    reuseExistingServer: false,
    timeout: 20_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
