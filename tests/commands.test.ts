import { beforeAll, expect, test } from 'bun:test';

const safeEnvironment = {
  ...process.env,
  DEXIE_DATABASE_URL: '',
  DEXIE_CLIENT_ID: '',
  DEXIE_CLIENT_SECRET: '',
  DEXIE_SCHEMA_PATH: '',
};
const origins = ['http://127.0.0.1:3001', 'http://127.0.0.1:5173'];
function spawn(command: string[]) {
  return Bun.spawn([process.execPath, ...command], {
    env: safeEnvironment,
    stdout: 'ignore',
    stderr: 'ignore',
  });
}
async function reachable(origin: string) {
  try {
    return await fetch(`${origin}/api/status`, {
      signal: AbortSignal.timeout(200),
    });
  } catch {
    return undefined;
  }
}
async function ready(origin: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await reachable(origin))?.ok) return;
    await Bun.sleep(50);
  }
  throw new Error('Local command did not become ready');
}
async function stopped(proc: ReturnType<typeof spawn>) {
  try {
    return await Promise.race([
      proc.exited,
      Bun.sleep(5000).then(() => {
        throw new Error('Local command failed to shut down');
      }),
    ]);
  } finally {
    if (proc.exitCode === null) proc.kill('SIGKILL');
  }
}
beforeAll(async () => {
  for (const origin of origins) {
    if (await reachable(origin))
      throw new Error('Stop the existing local app before command tests');
  }
  expect(await spawn(['run', 'build']).exited).toBe(0);
}, 20_000);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  test(`dev starts both local servers and releases both on ${signal}`, async () => {
    const proc = spawn(['scripts/dev.ts']);
    try {
      await Promise.all(origins.map(ready));
      const status: unknown = await (
        await fetch(`${origins[1]}/api/status`)
      ).json();
      expect(status).toHaveProperty('state', 'unconfigured');
      proc.kill(signal);
      expect(await stopped(proc)).toBe(0);
      for (const origin of origins)
        expect(await reachable(origin)).toBeUndefined();
    } finally {
      proc.kill('SIGTERM');
      await stopped(proc);
    }
  }, 15_000);
}

test('dev closes the API when Vite cannot bind its strict port', async () => {
  const occupied = Bun.serve({
    hostname: '127.0.0.1',
    port: 5173,
    fetch: () => new Response('occupied'),
  });
  const proc = spawn(['scripts/dev.ts']);
  try {
    expect(await stopped(proc)).not.toBe(0);
    expect(await reachable(origins[0]!)).toBeUndefined();
  } finally {
    proc.kill();
    await occupied.stop(true);
  }
}, 10_000);

test('dev closes Vite when the API cannot bind its port', async () => {
  const occupied = Bun.serve({
    hostname: '127.0.0.1',
    port: 3001,
    fetch: () => new Response('occupied'),
  });
  const proc = spawn(['scripts/dev.ts']);
  try {
    expect(await stopped(proc)).not.toBe(0);
    expect(await reachable(origins[1]!)).toBeUndefined();
  } finally {
    proc.kill();
    await occupied.stop(true);
  }
}, 10_000);

test('built start serves the shell and API with production-only origin guards', async () => {
  const proc = spawn(['run', 'start']);
  try {
    await ready(origins[0]!);
    expect((await fetch(origins[0]!)).headers.get('Content-Type')).toContain(
      'text/html',
    );
    expect((await fetch(`${origins[0]}/api/missing`)).status).toBe(404);
    expect((await fetch(`${origins[0]}/server.js`)).status).toBe(404);
    expect(
      (
        await fetch(`${origins[0]}/api/status`, {
          headers: { Origin: origins[1]! },
        })
      ).status,
    ).toBe(403);
  } finally {
    proc.kill('SIGTERM');
    await stopped(proc);
  }
  expect(await reachable(origins[0]!)).toBeUndefined();
}, 15_000);
