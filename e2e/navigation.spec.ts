import { expect, test } from '@playwright/test';

test('lists configured tables alphabetically and exposes compound and dotted key metadata', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type()))
      problems.push(message.text());
  });
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Tables' });
  await expect(navigation.getByRole('button')).toHaveText([
    'a/b ?#%😀',
    'empty',
    'items',
    'roles',
  ]);
  await navigation.getByRole('button', { name: 'roles', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'roles', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('[realmId+name]', { exact: true })).toBeVisible();
  await expect(
    navigation.getByRole('button', { name: 'roles', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  await navigation
    .getByRole('button', { name: 'a/b ?#%😀', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'a/b ?#%😀', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('meta.key', { exact: true })).toBeVisible();
  expect(problems).toEqual([]);
});

test('filtering changes navigation without clearing the selected table or reloading metadata', async ({
  page,
}) => {
  let metadataRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/tables') metadataRequests++;
  });
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Tables' });
  await navigation.getByRole('button', { name: 'items', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search tables' });
  await search.fill('ROLE');
  await expect(navigation.getByRole('button')).toHaveText(['roles']);
  await expect(
    page.getByRole('heading', { name: 'items', exact: true }),
  ).toBeVisible();
  await search.fill('no such table');
  await expect(
    navigation.getByText('No table names match this filter.'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'items', exact: true }),
  ).toBeVisible();
  await search.fill('');
  await expect(
    navigation.getByRole('button', { name: 'items', exact: true }),
  ).toHaveAttribute('aria-current', 'true');
  expect(metadataRequests).toBe(1);
});

test('supports keyboard filtering and table selection', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Search tables' });
  await search.fill('items');
  await search.press('Tab');
  const item = page
    .getByRole('navigation', { name: 'Tables' })
    .getByRole('button', { name: 'items', exact: true });
  await expect(item).toBeFocused();
  await item.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'items', exact: true }),
  ).toBeVisible();
  await expect(item).toBeFocused();
  await expect(page.getByText('@key', { exact: true })).toBeVisible();
});

test('distinguishes a valid empty schema from missing configuration', async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ 'X-Dexie-Test-Scenario': 'empty-schema' });
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: 'No tables in schema export',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Cloud access has not been verified', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await page.setExtraHTTPHeaders({ 'X-Dexie-Test-Scenario': 'unconfigured' });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Database setup required' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No tables in schema export' }),
  ).toHaveCount(0);
});

test('shows loading, safe failure, and retry recovery for table metadata', async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/tables', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Loading tables', exact: true }),
  ).toBeVisible();
  release?.();
  await expect(
    page.getByRole('searchbox', { name: 'Search tables' }),
  ).toBeVisible();
  await page.unroute('**/api/tables');
  await page.route('**/api/tables', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":{"message":"fixture-secret raw failure"}}',
    }),
  );
  await page.getByRole('button', { name: 'Check setup again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Tables unavailable', exact: true }),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText('fixture-secret');
  await page.unroute('**/api/tables');
  await page.getByRole('button', { name: 'Check setup again' }).click();
  await expect(
    page.getByRole('searchbox', { name: 'Search tables' }),
  ).toBeVisible();
});

for (const width of [320, 768, 1024, 1440]) {
  test(`navigation stays usable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'a/b ?#%😀', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'a/b ?#%😀', exact: true }),
    ).toBeVisible();
    const size = await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return {
        viewport: innerWidth,
        content: document.documentElement.scrollWidth,
      };
    });
    expect(size.content).toBeLessThanOrEqual(size.viewport);
    await page.screenshot({
      path: testInfo.outputPath(`navigation-${width}.png`),
      fullPage: true,
    });
  });
}
