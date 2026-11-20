import { expect, test } from '@playwright/test';

for (const count of [0, 1, 50, 51]) {
  test(`browses a complete ${count}-record result in 50-row display pages`, async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({
      'X-Dexie-Test-Scenario': `records-${count}`,
    });
    let reads = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/tables/items/records')) reads++;
    });
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Tables' })
      .getByRole('button', { name: 'items', exact: true })
      .click();
    await expect(
      page.getByText(`${count} ${count === 1 ? 'record' : 'records'}`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('time')).toHaveAttribute(
      'datetime',
      /^\d{4}-\d{2}-\d{2}T/,
    );
    if (count === 0) {
      await expect(
        page.getByRole('heading', { name: 'This table is empty' }),
      ).toBeVisible();
      await expect(page.getByRole('table')).toHaveCount(0);
    } else {
      const table = page.getByRole('table', { name: 'items records' });
      await expect(table.locator('tbody tr')).toHaveCount(Math.min(count, 50));
      expect((await table.getByRole('columnheader').allTextContents())[0]).toBe(
        'key',
      );
      await expect(
        page.getByRole('button', { name: 'Previous page' }),
      ).toBeDisabled();
      if (count === 51) {
        await expect(
          table.getByRole('columnheader', { name: 'pageTwoOnly', exact: true }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Next page' }).click();
        await expect(table.locator('tbody tr')).toHaveCount(1);
        await expect(
          table.getByRole('cell', { name: '"row-51"', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByText('Page 2 of 2', { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Next page' }),
        ).toBeDisabled();
        await page.getByRole('button', { name: 'Previous page' }).click();
        await expect(table.locator('tbody tr')).toHaveCount(50);
      } else
        await expect(
          page.getByRole('button', { name: 'Next page' }),
        ).toBeDisabled();
    }
    expect(reads).toBe(1);
  });
}

test('renders heterogeneous multi-realm values as escaped text with labeled previews', async ({
  page,
}) => {
  const problems: string[] = [];
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
  const table = page.getByRole('table', { name: 'items records' });
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(
    table.getByRole('cell', { name: '"realm-one"', exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole('cell', { name: '"realm-two"', exact: true }),
  ).toHaveCount(2);
  for (const text of [
    'false',
    '0',
    '"" (empty string)',
    'Date (typed value)',
    'Blob (reference)',
    '"<img src=x onerror=alert(1)>"',
  ]) {
    await expect(
      table.getByRole('cell', { name: text, exact: true }),
    ).toBeVisible();
  }
  await expect(
    table.getByRole('cell', { name: 'Missing', exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('shows record loading and a sanitized failure, then retries the selected table', async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/tables/items/records', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Tables' })
    .getByRole('button', { name: 'items', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Loading records', exact: true }),
  ).toBeVisible();
  await expect(page.locator('time')).toHaveCount(0);
  release?.();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
  await page.unroute('**/api/tables/items/records');
  await page
    .getByRole('navigation', { name: 'Tables' })
    .getByRole('button', { name: 'empty', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'This table is empty' }),
  ).toBeVisible();
  await page.route('**/api/tables/items/records', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: '{"error":{"code":"PERMISSION_ERROR","message":"fixture-secret upstream details","retryable":false}}',
    }),
  );
  await page
    .getByRole('navigation', { name: 'Tables' })
    .getByRole('button', { name: 'items', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Cannot load records', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Check ACCESS_DB and GLOBAL_READ/)).toBeVisible();
  await expect(page.locator('body')).not.toContainText('fixture-secret');
  await expect(page.locator('time')).toHaveCount(0);
  await page.unroute('**/api/tables/items/records');
  await page.getByRole('button', { name: 'Retry records' }).click();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
});

for (const width of [320, 1440]) {
  test(`wide records scroll within their table at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Tables' })
      .getByRole('button', { name: 'items', exact: true })
      .click();
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
    const region = page.getByRole('region', { name: 'Scrollable records' });
    const dimensions = await region.evaluate((node) => ({
      content: node.scrollWidth,
      visible: node.clientWidth,
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(dimensions.content).toBeGreaterThan(dimensions.visible);
    expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
    const scrollRight = page.getByRole('button', {
      name: 'Scroll records right',
    });
    await scrollRight.focus();
    await scrollRight.press('Enter');
    await expect
      .poll(() => region.evaluate((node) => node.scrollLeft))
      .toBeGreaterThan(0);
    await page.screenshot({
      path: testInfo.outputPath(`records-${width}.png`),
      fullPage: true,
    });
  });
}
