import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type ViteDevServer } from 'vite';
import config from '../vite.config';

describe('development configuration files', () => {
  const privatePaths = [
    '.env',
    '.env.local',
    'dexie-cloud.key',
    'local/schema.json',
    'export-schema.json',
    'dexie-cloud.json',
  ];
  const owner = crypto.randomUUID();
  let directory = '';
  let server: ViteDevServer | undefined;
  let origin = '';

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dexie-static-test-'));
    await writeFile(join(directory, '.owner'), owner);
    await mkdir(join(directory, 'local'));
    await mkdir(join(directory, 'public', 'local'), { recursive: true });
    await writeFile(
      join(directory, 'public', 'local', 'schema.json'),
      'synthetic-private-configuration',
    );
    await writeFile(
      join(directory, 'public', 'dexie-cloud.key'),
      'synthetic-private-configuration',
    );
    for (const path of privatePaths) {
      await writeFile(join(directory, path), 'synthetic-private-configuration');
    }
    await writeFile(join(directory, 'visible.txt'), 'public fixture');
    server = await createServer({
      root: directory,
      configFile: false,
      envFile: false,
      logLevel: 'silent',
      publicDir: config.publicDir ?? 'public',
      server: { ...config.server, port: 0 },
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string')
      throw new Error('Test server has no TCP address');
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await server?.close();
    // Only clean up the exact private fixture directory created by this test.
    if (
      directory &&
      (await readFile(join(directory, '.owner'), 'utf8')) === owner
    ) {
      await rm(directory, { recursive: true });
    }
  });

  test.each(privatePaths)(
    'never serves private setup through /%s',
    async (path) => {
      const response = await fetch(`${origin}/${path}`);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain(
        'synthetic-private-configuration',
      );
    },
  );

  test('also protects schema exports through raw imports and filesystem URLs', async () => {
    for (const path of [
      '/local/schema.json?raw',
      `/@fs/${directory}/local/schema.json`,
    ]) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain(
        'synthetic-private-configuration',
      );
    }
  });

  test('continues serving public application assets', async () => {
    const response = await fetch(`${origin}/visible.txt`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('public fixture');
  });
});
