import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaticHandler } from '../server/static';

let directory = '';
let handler: Awaited<ReturnType<typeof createStaticHandler>>;
const owner = crypto.randomUUID();
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dexie-built-test-'));
  await writeFile(join(directory, '.owner'), owner);
  const root = join(directory, 'dist');
  await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<h1>Public shell</h1>');
  await writeFile(join(root, 'assets/app.js'), 'console.log("public script")');
  await writeFile(join(root, 'assets/app.css'), 'body{color:black}');
  await writeFile(join(directory, '.env'), 'synthetic-private');
  await writeFile(join(root, 'server.js'), 'synthetic-private');
  await symlink(join(directory, '.env'), join(root, 'assets/leak.js'));
  handler = await createStaticHandler(root, () =>
    Promise.resolve(Response.json({ error: 'API fixture' }, { status: 404 })),
  );
});
afterAll(async () => {
  if (
    directory &&
    (await readFile(join(directory, '.owner'), 'utf8')) === owner
  )
    await rm(directory, { recursive: true });
});
function request(path: string, init?: RequestInit) {
  return handler(
    new Request(`http://127.0.0.1:3001${path}`, {
      ...init,
      headers: { Host: '127.0.0.1:3001', ...init?.headers },
    }),
  );
}

test('serves only the built shell and public assets with security headers', async () => {
  for (const [path, type, content] of [
    ['/', 'text/html', 'Public shell'],
    ['/index.html', 'text/html', 'Public shell'],
    ['/assets/app.js', 'javascript', 'public script'],
    ['/assets/app.css', 'text/css', 'color:black'],
  ]) {
    const response = await request(path!);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain(type!);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Content-Security-Policy')).toContain(
      "connect-src 'self'",
    );
    expect(await response.text()).toContain(content!);
  }
});

test.each([
  '/.env',
  '/server.js',
  '/src/main.ts',
  '/local/schema.json',
  '/assets/app.js.map',
  '/assets/missing.js',
  '/assets/leak.js',
  '/assets/%2e%2e/.env',
  '/assets/%2e%2e%2f.env',
  '/assets/%5c..%5c.env',
  '/assets/%00.js',
  '/assets/%.js',
  '/unknown',
])('does not expose private paths or fall back to HTML: %s', async (path) => {
  const response = await request(path);
  expect(response.status).toBe(404);
  expect(response.headers.get('Content-Type')).toContain('application/json');
  expect(await response.text()).not.toMatch(/synthetic-private|Public shell/);
});

test('dispatches the entire API namespace without an HTML fallback', async () => {
  for (const path of ['/api', '/api/unknown', '/api/tables/no/records']) {
    const response = await request(path);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'API fixture' });
  }
});

test('rejects invalid Hosts, foreign browser origins, and cross-site static requests', async () => {
  for (const headers of [
    { Host: 'evil.example' },
    { Origin: 'https://evil.example' },
    { Origin: 'http://127.0.0.1:5173' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    expect((await request('/', { headers })).status).toBe(403);
    expect((await request('/assets/app.js', { headers })).status).toBe(403);
  }
});

test('rejects static mutations and query strings', async () => {
  const response = await request('/', { method: 'POST', body: 'ignored' });
  expect(response.status).toBe(405);
  expect(response.headers.get('Allow')).toBe('GET');
  expect((await request('/?file=.env')).status).toBe(400);
});

test('fails startup clearly if the frontend has not been built', async () => {
  const error: unknown = await createStaticHandler(
    join(directory, 'missing'),
    handler,
  ).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(Error);
  expect(error).toHaveProperty(
    'message',
    'Run bun run build before bun run start.',
  );
});
