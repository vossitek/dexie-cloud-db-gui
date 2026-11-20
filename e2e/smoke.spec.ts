import { expect, test } from '@playwright/test';
import { fixtureRecords } from './fixtures';

test('loads the real application and setup API without external requests or browser errors', async ({
  page,
}, testInfo) => {
  const problems: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()))
      problems.push(message.text());
  });
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== 'http://127.0.0.1:5173') {
      externalRequests.push(route.request().url());
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Database configuration is ready' }),
  ).toBeVisible();
  await expect(
    page.getByText('https://fixture-db.dexie.cloud', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Check setup again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Database configuration is ready' }),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText('fixture-secret');
  await expect(page.locator('body')).not.toContainText('fixture-client');
  expect(process.versions.bun).toBeDefined();
  expect(externalRequests).toEqual([]);
  expect(problems).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath('setup.png'),
    fullPage: true,
  });
});

test('browser reads traverse the local API and retain complete multi-realm fixture data', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/tables/items/records');
    const body: unknown = await response.json();
    return {
      status: response.status,
      cache: response.headers.get('Cache-Control'),
      body,
    };
  });
  expect(result.status).toBe(200);
  expect(result.cache).toBe('no-store');
  expect(result.body).toMatchObject({ records: fixtureRecords.items });
  expect(JSON.stringify(result.body)).not.toContain('fixture-token');
  expect(JSON.stringify(result.body)).not.toContain('fixture-secret');
});

test('browser reads distinguish an empty table and unknown table through the actual handlers', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const empty = await fetch('/api/tables/empty/records');
    const missing = await fetch('/api/tables/unknown/records');
    const emptyBody: unknown = await empty.json();
    const missingBody: unknown = await missing.json();
    return {
      emptyStatus: empty.status,
      emptyBody,
      missingStatus: missing.status,
      missingBody,
    };
  });
  expect(result.emptyStatus).toBe(200);
  expect(result.emptyBody).toMatchObject({ records: [] });
  expect(result.missingStatus).toBe(404);
  expect(result.missingBody).toMatchObject({
    error: { code: 'NOT_FOUND', retryable: false },
  });
});
