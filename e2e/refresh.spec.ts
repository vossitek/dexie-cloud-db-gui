import { expect, test } from '@playwright/test';

test('refresh requests a fresh snapshot, resets display paging and updates the fetch time', async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ 'X-Dexie-Test-Scenario': 'records-51' });
  let reads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/tables/items/records')
      reads++;
  });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Tables' })
    .getByRole('button', { name: 'items', exact: true })
    .click();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(50);
  const firstTime = await page.locator('time').getAttribute('datetime');
  await page.getByRole('button', { name: 'Next page' }).click();
  await page
    .getByRole('button', { name: 'Inspect record 51', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page
    .getByRole('button', { name: 'Refresh table', exact: true })
    .click();
  await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(50);
  await expect(page.locator('time')).not.toHaveAttribute(
    'datetime',
    firstTime!,
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(reads).toBe(2);
});

test('selecting another table aborts a delayed read and retains the newer selection', async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/tables/items/records', async (route) => {
    await gate;
    await route.fulfill({
      contentType: 'application/json',
      body: '{"records":[{"key":"stale"}],"fetchedAt":"2026-11-20T10:20:30.000Z"}',
    });
  });
  await page.goto('/');
  const tables = page.getByRole('navigation', { name: 'Tables' });
  await tables.getByRole('button', { name: 'items', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Loading records' }),
  ).toBeVisible();
  await tables.getByRole('button', { name: 'roles', exact: true }).click();
  await expect(
    page.getByRole('table', { name: 'roles records' }).locator('tbody tr'),
  ).toHaveCount(1);
  const time = await page.locator('time').getAttribute('datetime');
  release?.();
  await expect(
    page.getByRole('heading', { name: 'roles', exact: true }),
  ).toBeVisible();
  await expect(page.locator('time')).toHaveAttribute('datetime', time!);
  await expect(page.getByRole('table')).not.toContainText('stale');
});

for (const [code, status, message] of [
  ['AUTHENTICATION_ERROR', 401, 'Dexie Cloud rejected authentication.'],
  ['PERMISSION_ERROR', 403, 'The configured client cannot read this table.'],
  ['SIZE_LIMIT', 413, 'This table exceeds the 10,000-record or 10 MiB limit.'],
  ['TIMEOUT', 504, 'Reading this table timed out.'],
  ['NETWORK_ERROR', 502, 'Cannot load records.'],
] as const) {
  test(`failed ${code} refresh releases stale data and supports explicit retry`, async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Tables' })
      .getByRole('button', { name: 'items', exact: true })
      .click();
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
    await page.route('**/api/tables/items/records', (route) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code,
            message: 'fixture-private fixture-secret upstream failure',
            retryable: true,
          },
        }),
      }),
    );
    await page
      .getByRole('button', { name: 'Refresh table', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Cannot load records', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.locator('time')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('fixture-private');
    await expect(page.locator('body')).not.toContainText('fixture-secret');
    await page.unroute('**/api/tables/items/records');
    await page.getByRole('button', { name: 'Retry records' }).click();
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
    await expect(page.locator('time')).toBeVisible();
  });
}
