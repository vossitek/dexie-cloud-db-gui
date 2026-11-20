import { createServer, type ViteDevServer } from 'vite';

// Keep Vite in this supervisor so there is only one child process to reap.
// https://bun.sh/docs/runtime/child-process
let vite: ViteDevServer | undefined;
let api: ReturnType<typeof Bun.spawn> | undefined;
let stopping = false;
async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  const force = setTimeout(() => api?.kill('SIGKILL'), 3000);
  try {
    api?.kill('SIGTERM');
    await Promise.all([api?.exited, vite?.close()]);
  } finally {
    clearTimeout(force);
  }
}
process.once('SIGINT', () => {
  void stop(0);
});
process.once('SIGTERM', () => {
  void stop(0);
});
try {
  api = Bun.spawn([process.execPath, 'server/index.ts', '--development'], {
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  void api.exited.then(() => {
    if (!stopping) {
      console.error('Local API stopped; closing development server.');
      void stop(1);
    }
  });
  vite = await createServer();
  if (!stopping) {
    await vite.listen();
    vite.printUrls();
  } else {
    await vite.close();
  }
} catch {
  console.error(
    'Development startup failed. Check that ports 3001 and 5173 are available.',
  );
  await stop(1);
}
