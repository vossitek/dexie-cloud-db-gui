import { expect, test } from '@playwright/test';

test('keyboard users can skip, filter, select, inspect, close, and refresh with visible focus', async ({
  page,
}) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to records' });
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  const search = page.getByRole('searchbox', { name: 'Search tables' });
  await search.focus();
  await search.fill('items');
  await search.press('Tab');
  const item = page.getByRole('button', { name: 'items', exact: true });
  await expect(item).toBeFocused();
  expect(
    await item.evaluate((node) => getComputedStyle(node).outlineStyle),
  ).toBe('solid');
  await item.press('Enter');
  await expect(item).toHaveAttribute('aria-current', 'true');
  await expect(
    page.getByRole('table', { name: 'items records' }),
  ).toBeVisible();
  const opener = page.getByRole('button', {
    name: 'Inspect record 1',
    exact: true,
  });
  await opener.focus();
  await opener.press('Space');
  const dialog = page.getByRole('dialog', { name: 'Record details' });
  await expect(
    dialog.getByRole('button', { name: 'Close inspector' }),
  ).toBeFocused();
  await expect(
    dialog.getByRole('textbox', { name: 'Complete record JSON' }),
  ).toHaveAttribute('readonly', '');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  const refresh = page.getByRole('button', { name: 'Refresh table' });
  await refresh.focus();
  await refresh.press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: /^3 records$/ }),
  ).toBeVisible();
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

test('search field boundary and key text colors meet AA contrast', async ({
  page,
}) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: 'Search tables' });
  await expect(search).toBeVisible();
  const ratios = await search.evaluate((node) => {
    const luminance = (rgb: string) => {
      const channels = rgb
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          const value = v / 255;
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        });
      return (
        channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
      );
    };
    const ratio = (a: string, b: string) => {
      const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (values[0]! + 0.05) / (values[1]! + 0.05);
    };
    const style = getComputedStyle(node);
    const muted = getComputedStyle(document.querySelector('.brand-caption')!);
    const badge = getComputedStyle(document.querySelector('.read-only-badge')!);
    return {
      inputBoundary: ratio(style.borderTopColor, style.backgroundColor),
      inputText: ratio(style.color, style.backgroundColor),
      muted: ratio(muted.color, 'rgb(255,255,255)'),
      accent: ratio(badge.color, badge.backgroundColor),
    };
  });
  expect(ratios.inputBoundary).toBeGreaterThanOrEqual(3);
  expect(ratios.inputText).toBeGreaterThanOrEqual(4.5);
  expect(ratios.muted).toBeGreaterThanOrEqual(4.5);
  expect(ratios.accent).toBeGreaterThanOrEqual(4.5);
});

for (const options of [
  { viewport: { width: 640, height: 450 }, reducedMotion: 'reduce' as const },
  { viewport: { width: 320, height: 900 }, forcedColors: 'active' as const },
]) {
  test(`records and inspector remain usable in ${'forcedColors' in options ? 'forced colors' : '200% equivalent reflow'}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(options.viewport);
    await page.emulateMedia(options);
    await page.goto('/');
    await page.getByRole('button', { name: 'items', exact: true }).click();
    await page
      .getByRole('button', { name: 'Inspect record 1', exact: true })
      .click();
    const json = page.getByRole('textbox', { name: 'Complete record JSON' });
    await expect(json).toBeVisible();
    expect(await json.inputValue()).toContain('owner-one');
    const dimensions = await page.evaluate(() => ({
      width: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
    await page.screenshot({
      path: testInfo.outputPath('accessible-inspector.png'),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Inspect record 1', exact: true }),
    ).toBeFocused();
  });
}
