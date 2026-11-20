import { expect, test } from '@playwright/test';
import type { RecordsResponse, TableMetadata } from '../shared/contracts';

test('late successes cannot replace newer table records or timestamps when a loader ignores abort', async ({
  page,
}) => {
  await page.goto('/');
  const observed = await page.evaluate(async () => {
    const path = '/src/lib/explorer-state.svelte.ts';
    const { createExplorerState } = (await import(
      path
    )) as typeof import('../src/lib/explorer-state.svelte.ts');
    const pending: {
      signal: AbortSignal;
      resolve: (value: RecordsResponse) => void;
    }[] = [];
    const explorer = createExplorerState(
      (_name, signal) =>
        new Promise((resolve) => pending.push({ signal, resolve })),
    );
    const table = (name: string): TableMetadata => ({
      name,
      primaryKey: '@key',
      keyPaths: ['key'],
    });
    const first = explorer.select(table('items'));
    const second = explorer.select(table('roles'));
    pending[1]!.resolve({
      records: [{ key: 'new' }],
      fetchedAt: '2026-11-20T10:20:31.000Z',
    });
    await second;
    pending[0]!.resolve({
      records: [{ key: 'old' }],
      fetchedAt: '2026-11-20T10:20:30.000Z',
    });
    await first;
    const result = {
      firstAborted: pending[0]!.signal.aborted,
      table: explorer.table?.name,
      records: explorer.result?.records,
      fetchedAt: explorer.result?.fetchedAt,
      pending: explorer.pending,
      failure: explorer.failure,
    };
    explorer.dispose();
    return result;
  });
  expect(observed).toEqual({
    firstAborted: true,
    table: 'roles',
    records: [{ key: 'new' }],
    fetchedAt: '2026-11-20T10:20:31.000Z',
    pending: false,
    failure: null,
  });
});

test('late errors and finally callbacks cannot overwrite an active newer refresh', async ({
  page,
}) => {
  await page.goto('/');
  const observed = await page.evaluate(async () => {
    const path = '/src/lib/explorer-state.svelte.ts';
    const { createExplorerState } = (await import(
      path
    )) as typeof import('../src/lib/explorer-state.svelte.ts');
    const pending: {
      signal: AbortSignal;
      resolve: (value: RecordsResponse) => void;
      reject: (reason: Error) => void;
    }[] = [];
    const explorer = createExplorerState(
      (_name, signal) =>
        new Promise((resolve, reject) =>
          pending.push({ signal, resolve, reject }),
        ),
    );
    const first = explorer.select({
      name: 'items',
      primaryKey: '@key',
      keyPaths: ['key'],
    });
    const second = explorer.refresh();
    pending[0]!.reject(new Error('fixture-private old failure'));
    await first;
    const during = {
      pending: explorer.pending,
      result: explorer.result,
      failure: explorer.failure,
    };
    pending[1]!.resolve({
      records: [{ key: 'current' }],
      fetchedAt: '2026-11-20T10:20:32.000Z',
    });
    await second;
    const after = {
      pending: explorer.pending,
      records: explorer.result?.records,
      failure: explorer.failure,
    };
    explorer.dispose();
    return { during, after };
  });
  expect(observed).toEqual({
    during: { pending: true, result: null, failure: null },
    after: { pending: false, records: [{ key: 'current' }], failure: null },
  });
});

test('refresh and disposal release records, paging and inspection before any replacement result', async ({
  page,
}) => {
  await page.goto('/');
  const observed = await page.evaluate(async () => {
    const path = '/src/lib/explorer-state.svelte.ts';
    const { createExplorerState } = (await import(
      path
    )) as typeof import('../src/lib/explorer-state.svelte.ts');
    const pending: {
      signal: AbortSignal;
      resolve: (value: RecordsResponse) => void;
    }[] = [];
    const explorer = createExplorerState(
      (_name, signal) =>
        new Promise((resolve) => pending.push({ signal, resolve })),
    );
    const first = explorer.select({
      name: 'items',
      primaryKey: '@key',
      keyPaths: ['key'],
    });
    pending[0]!.resolve({
      records: Array.from({ length: 51 }, (_, key) => ({ key })),
      fetchedAt: '2026-11-20T10:20:30.000Z',
    });
    await first;
    explorer.setPage(2);
    explorer.inspect(
      explorer.result!.records[50]!,
      document.createElement('button'),
    );
    const before = {
      page: explorer.pageNumber,
      inspecting: explorer.inspected !== null,
    };
    const refresh = explorer.refresh();
    const during = {
      page: explorer.pageNumber,
      inspecting: explorer.inspected !== null,
      result: explorer.result,
      pending: explorer.pending,
    };
    pending[1]!.resolve({
      records: [{ key: 'refreshed' }],
      fetchedAt: '2026-11-20T10:20:31.000Z',
    });
    await refresh;
    const after = {
      records: explorer.result?.records,
      page: explorer.pageNumber,
    };
    const last = explorer.refresh();
    explorer.dispose();
    pending[2]!.resolve({
      records: [{ key: 'too late' }],
      fetchedAt: '2026-11-20T10:20:32.000Z',
    });
    await last;
    return {
      before,
      during,
      after,
      disposed: {
        aborted: pending[2]!.signal.aborted,
        result: explorer.result,
        table: explorer.table,
        pending: explorer.pending,
        inspecting: explorer.inspected !== null,
      },
    };
  });
  expect(observed).toEqual({
    before: { page: 2, inspecting: true },
    during: { page: 1, inspecting: false, result: null, pending: true },
    after: { records: [{ key: 'refreshed' }], page: 1 },
    disposed: {
      aborted: true,
      result: null,
      table: null,
      pending: false,
      inspecting: false,
    },
  });
});
