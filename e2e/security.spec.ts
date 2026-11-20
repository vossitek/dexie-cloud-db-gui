import { expect, test } from '@playwright/test';

test('a different website cannot read records through browser CORS', async ({
  page,
  baseURL,
}) => {
  const foreign = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () =>
      new Response('<!doctype html><title>Foreign site fixture</title>', {
        headers: { 'Content-Type': 'text/html' },
      }),
  });
  try {
    await page.goto(foreign.url.href);
    const result = await page.evaluate(async (url) => {
      try {
        return { readable: true, body: await (await fetch(url)).text() };
      } catch {
        return { readable: false };
      }
    }, `${baseURL}/api/tables/items/records`);
    expect(result).toEqual({ readable: false });
  } finally {
    await foreign.stop(true);
  }
});

test('rejects foreign browser contexts, invalid Hosts and mutations on the assembled API', async ({
  request,
}) => {
  for (const headers of [
    { Origin: 'https://hostile.example' },
    { Host: 'hostile.example' },
    { 'Sec-Fetch-Site': 'cross-site' },
    { Origin: 'null' },
  ]) {
    const response = await request.get('/api/tables/items/records', {
      headers,
    });
    expect(response.status()).toBe(403);
    expect(response.headers()['access-control-allow-origin']).toBeUndefined();
    // Vite rejects an invalid Host before proxying; check the API's own
    // no-store rejection directly as well as the outer refusal.
    const direct = await request.get(
      'http://127.0.0.1:3001/api/tables/items/records',
      { headers },
    );
    expect(direct.status()).toBe(403);
    expect(direct.headers()['cache-control']).toBe('no-store');
    if (!('Host' in headers))
      expect(response.headers()['cache-control']).toBe('no-store');
    expect(await response.text()).not.toMatch(
      /fixture-token|fixture-secret|First item/,
    );
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    expect(
      (await request.fetch('/api/tables/items/records', { method })).status(),
    ).toBe(405);
  }
  const missing = await request.get('/api/not-a-route');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/json');
});

test('browsing and refreshing keep tokens server-side and create no persistent record cache', async ({
  page,
}) => {
  const methods: string[] = [];
  const responses: Promise<void>[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      methods.push(request.method());
  });
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/api/')) {
      responses.push(
        (async () => {
          expect(response.headers()['cache-control']).toBe('no-store');
          expect(await response.text()).not.toMatch(
            /fixture-token|fixture-secret|fixture-client/,
          );
        })(),
      );
    }
  });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Tables' })
    .getByRole('button', { name: 'items', exact: true })
    .click();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
  await page.getByRole('button', { name: 'Refresh table' }).click();
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(3);
  await page
    .getByRole('button', { name: 'Inspect record 3', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Complete record JSON' }),
  ).toHaveValue(/<img src=x onerror=alert\(1\)>/);
  await expect(page.locator('img, iframe, a[href^="http"]')).toHaveCount(0);
  const persistence = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
    workers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  expect(persistence).toEqual({
    local: 0,
    session: 0,
    databases: 0,
    caches: 0,
    workers: 0,
  });
  expect(methods.length).toBeGreaterThan(2);
  expect(methods.every((method) => method === 'GET')).toBe(true);
  await Promise.all(responses);
});
