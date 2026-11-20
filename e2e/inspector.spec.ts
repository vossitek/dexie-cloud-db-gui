import { expect, test } from '@playwright/test';
import { fixtureRecords } from './fixtures';
import type { DatabaseRecord } from '../shared/contracts';

test('inspects complete in-memory records without additional data or blob requests', async ({
  page,
}) => {
  const requests: string[] = [];
  const problems: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type()))
      problems.push(message.text());
  });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Tables' })
    .getByRole('button', { name: 'items', exact: true })
    .click();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
  const before = requests.length;
  for (const index of [1, 2, 3]) {
    const opener = page.getByRole('button', {
      name: `Inspect record ${index}`,
      exact: true,
    });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Record details' });
    await expect(dialog).toBeVisible();
    const text = await dialog
      .getByRole('textbox', { name: 'Complete record JSON' })
      .inputValue();
    const record: unknown = JSON.parse(text);
    expect(record).toEqual(fixtureRecords.items?.[index - 1]);
    await expect(dialog.locator('img, script, iframe')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close inspector' }).click();
    await expect(opener).toBeFocused();
  }
  expect(requests).toHaveLength(before);
  expect(problems).toEqual([]);
});

test('supports keyboard opening, modal focus containment, Escape, and focus restoration', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Tables' })
    .getByRole('button', { name: 'items', exact: true })
    .click();
  const opener = page.getByRole('button', {
    name: 'Inspect record 1',
    exact: true,
  });
  await opener.focus();
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Record details' });
  const close = dialog.getByRole('button', { name: 'Close inspector' });
  await expect(close).toBeFocused();
  await close.press('Tab');
  const json = dialog.getByRole('textbox', { name: 'Complete record JSON' });
  await expect(json).toBeFocused();
  await expect(json).toHaveAttribute('readonly', '');
  await json.press('Tab');
  await expect(close).toBeFocused();
  await close.press('Shift+Tab');
  await expect(json).toBeFocused();
  await json.press('Tab');
  await expect(close).toBeFocused();
  await close.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('shows long values, unusual own properties and hostile text in full', async ({
  page,
}) => {
  const record: DatabaseRecord = {
    key: 'custom',
    owner: 'owner-x',
    realmId: 'realm-x',
    long: `${'α😀'.repeat(5000)}complete end`,
    constructor: 'stored value',
    nested: { flags: [null, false, 0, ''] },
    note: '<script>alert(1)</script><img src=x onerror=alert(1)>',
  };
  Object.defineProperty(record, '__proto__', {
    value: { own: true },
    enumerable: true,
  });
  await page.route('**/api/tables/items/records', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        records: [record],
        fetchedAt: '2026-11-20T10:20:30.000Z',
      }),
    }),
  );
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Tables' })
    .getByRole('button', { name: 'items', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Inspect record 1', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Record details' });
  const text = await dialog
    .getByRole('textbox', { name: 'Complete record JSON' })
    .inputValue();
  const inspected: unknown = JSON.parse(text);
  expect(inspected).toEqual(record);
  expect(text).toContain('complete end');
  await expect(dialog.locator('script, img')).toHaveCount(0);
});

test('preserves a 20,000-level record beyond Chromium’s native stringifier limit', async ({
  page,
}) => {
  const record = `{"key":"deep","realmId":"realm-deep","nested":${'['.repeat(20_000)}{"leaf":"complete"}${']'.repeat(20_000)}}`;
  await page.route('**/api/tables/items/records', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: `{"records":[${record}],"fetchedAt":"2026-11-20T10:20:30.000Z"}`,
    }),
  );
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Tables' })
    .getByRole('button', { name: 'items', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Inspect record 1', exact: true })
    .click();
  expect(
    await page
      .getByRole('textbox', { name: 'Complete record JSON' })
      .inputValue(),
  ).toBe(record);
});

test('inspects a page-two record without assuming an id field or fetching a primary key', async ({
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
  await page.getByRole('button', { name: 'Next page' }).click();
  const opener = page.getByRole('button', {
    name: 'Inspect record 51',
    exact: true,
  });
  await opener.click();
  expect(
    await page
      .getByRole('textbox', { name: 'Complete record JSON' })
      .inputValue(),
  ).toContain('row-51');
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(opener).toBeFocused();
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  expect(reads).toBe(1);
});

for (const width of [320, 1440]) {
  test(`inspector fits the viewport at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Tables' })
      .getByRole('button', { name: 'items', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Inspect record 1', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Record details' });
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath(`inspector-${width}.png`),
      fullPage: true,
    });
  });
}
