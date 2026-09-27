import assert from 'node:assert/strict';
import test from 'node:test';
import { buildActivityItems, getMatchedTransactionIds } from './activityBalances';
import type { Forecast, Transaction } from './firebase';
import {
  createReconciliationApi,
  createLatestReconciliationRefresh,
  ReconciliationError,
  reconciliationErrorMessage,
  runManualReconciliation,
} from './reconciliation';

const ok = (status: string) => new Response(JSON.stringify({ ok: true, status }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
const backendError = (status: number, code: string) => new Response(
  JSON.stringify({ ok: false, error: { code, message: 'Do not show this backend detail' } }),
  { status, headers: { 'Content-Type': 'application/json' } },
);

test('manual match sends only IDs and intent with a fresh Firebase bearer token', async () => {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let tokenCalls = 0;
  const api = createReconciliationApi({
    getIdToken: async () => `id-token-${++tokenCalls}`,
    getUrl: () => 'https://example.org/manual-reconciliation-api',
    send: async (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      return ok('matched');
    },
  });
  await api.manualMatch('F', 'T');
  // Replacement uses the same single request, without an intermediate unmatch.
  await api.manualMatch('F', 'B');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(({ init }) => JSON.parse(String(init.body))), [
    { action: 'match', forecast_id: 'F', transaction_id: 'T' },
    { action: 'match', forecast_id: 'F', transaction_id: 'B' },
  ]);
  assert.equal(requests[0].url, 'https://example.org/manual-reconciliation-api');
  assert.equal(requests[0].init.method, 'POST');
  assert.deepEqual(requests.map(({ init }) => (init.headers as Record<string, string>).Authorization), [
    'Bearer id-token-1', 'Bearer id-token-2',
  ]);
  assert.equal((requests[0].init.headers as Record<string, string>)['Content-Type'], 'application/json');
  assert.equal((requests[0].init.headers as Record<string, string>)['X-Firebase-ID-Token'], undefined);
});

test('manual unmatch sends no transaction ID, even for an already-unmatched success', async () => {
  const bodies: unknown[] = [];
  const api = createReconciliationApi({
    getIdToken: async () => 'id-token',
    getUrl: () => 'https://example.org/manual-reconciliation-api',
    send: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return ok('already_unmatched');
    },
  });
  await api.manualUnmatch('F');
  assert.deepEqual(bodies, [{ action: 'unmatch', forecast_id: 'F' }]);
});

test('missing auth and missing URL fail explicitly without sending a request', async () => {
  let sent = 0;
  const send = async () => { sent++; return ok('matched'); };
  const noUser = createReconciliationApi({
    getIdToken: async () => null,
    getUrl: () => 'https://example.org/manual-reconciliation-api',
    send,
  });
  await assert.rejects(noUser.manualMatch('F', 'T'), (error: unknown) =>
    error instanceof ReconciliationError && error.code === 'unauthenticated');
  const noUrl = createReconciliationApi({
    getIdToken: async () => 'token',
    getUrl: () => undefined,
    send,
  });
  await assert.rejects(noUrl.manualMatch('F', 'T'), (error: unknown) =>
    error instanceof ReconciliationError && error.code === 'configuration_missing');
  assert.equal(sent, 0);
});

test('backend errors are parsed without exposing raw messages or HTML', async () => {
  const api = createReconciliationApi({
    getIdToken: async () => 'token',
    getUrl: () => 'https://example.org/manual-reconciliation-api',
    send: async () => backendError(409, 'transaction_already_claimed'),
  });
  await assert.rejects(api.manualMatch('F', 'T'), (error: unknown) =>
    error instanceof ReconciliationError && error.status === 409 && error.code === 'transaction_already_claimed');
  assert.doesNotMatch(reconciliationErrorMessage(new ReconciliationError('ownership_denied', 403)), /backend detail/);
  assert.match(reconciliationErrorMessage(new ReconciliationError('authentication_unavailable', 503)), /temporarily unavailable/);
});

function makeFlow(api: ReturnType<typeof createReconciliationApi>) {
  const pending = new Set<string>();
  const events: string[] = [];
  const errors: Array<string | null> = [];
  const flow = {
    api,
    pending,
    setPending: (id: string, value: boolean) => events.push(`${id}:${value}`),
    setError: (message: string | null) => errors.push(message),
    refreshForecasts: async () => { events.push('refresh:forecasts'); },
    refreshTransactions: async () => { events.push('refresh:transactions'); },
  };
  return { flow, pending, events, errors };
}

test('success refreshes authoritative forecasts, keeps pending scoped, and clears it afterward', async () => {
  const api = createReconciliationApi({
    getIdToken: async () => 'token',
    getUrl: () => 'https://example.org/manual-reconciliation-api',
    send: async () => ok('matched'),
  });
  const { flow, pending, events, errors } = makeFlow(api);
  assert.equal(await runManualReconciliation({ action: 'match', forecastId: 'F', transactionId: 'T' }, flow), 'success');
  assert.deepEqual(events, ['F:true', 'refresh:forecasts', 'F:false']);
  assert.equal(pending.size, 0);
  assert.equal(errors.at(-1), null);
});

test('unmatch uses the backend once and waits for authoritative forecasts before clearing pending', async () => {
  const requests: unknown[] = [];
  const api = createReconciliationApi({
    getIdToken: async () => 'token',
    getUrl: () => 'https://example.org/manual-reconciliation-api',
    send: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return ok('unmatched');
    },
  });
  const { flow, events, pending } = makeFlow(api);
  assert.equal(await runManualReconciliation({ action: 'unmatch', forecastId: 'F' }, flow), 'success');
  assert.deepEqual(requests, [{ action: 'unmatch', forecast_id: 'F' }]);
  assert.deepEqual(events, ['F:true', 'refresh:forecasts', 'F:false']);
  assert.equal(pending.size, 0);
});

test('a duplicate submission for a pending forecast is ignored', async () => {
  let finish!: () => void;
  let calls = 0;
  const api = createReconciliationApi({
    getIdToken: async () => 'token',
    getUrl: () => 'https://example.org/manual-reconciliation-api',
    send: async () => {
      calls++;
      await new Promise<void>((resolve) => { finish = resolve; });
      return ok('matched');
    },
  });
  const { flow, pending } = makeFlow(api);
  const action = { action: 'match', forecastId: 'F', transactionId: 'T' } as const;
  const first = runManualReconciliation(action, flow);
  assert.equal(await runManualReconciliation(action, flow), 'pending');
  assert.equal(pending.has('F'), true);
  // The request awaits getIdToken before fetch; let that microtask complete.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls, 1);
  finish();
  assert.equal(await first, 'success');
  assert.equal(pending.size, 0);
});

test('claim and concurrent conflicts do not commit a local match or retry; they refresh and clear pending', async () => {
  for (const code of ['transaction_already_claimed', 'concurrent_conflict']) {
    let calls = 0;
    const api = createReconciliationApi({
      getIdToken: async () => 'token',
      getUrl: () => 'https://example.org/manual-reconciliation-api',
      send: async () => { calls++; return backendError(409, code); },
    });
    const { flow, pending, events, errors } = makeFlow(api);
    assert.equal(await runManualReconciliation({ action: 'match', forecastId: 'F', transactionId: 'T' }, flow), 'failed');
    assert.equal(calls, 1);
    assert.deepEqual(events, ['F:true', 'refresh:forecasts', 'refresh:transactions', 'F:false']);
    assert.equal(pending.size, 0);
    assert.match(errors.at(-1)!, /matched|changed/);
  }
});

test('a missing transaction refreshes the displayed transaction list and forecasts', async () => {
  const api = createReconciliationApi({
    getIdToken: async () => 'token',
    getUrl: () => 'https://example.org/manual-reconciliation-api',
    send: async () => backendError(404, 'transaction_not_found'),
  });
  const { flow, events } = makeFlow(api);
  assert.equal(await runManualReconciliation({ action: 'match', forecastId: 'F', transactionId: 'T' }, flow), 'failed');
  assert.deepEqual(events, ['F:true', 'refresh:forecasts', 'refresh:transactions', 'F:false']);
});

test('expired backend authentication clears pending and does not fall back to Firestore', async () => {
  const api = createReconciliationApi({
    getIdToken: async () => 'expired-token',
    getUrl: () => 'https://example.org/manual-reconciliation-api',
    send: async () => backendError(401, 'unauthenticated'),
  });
  const { flow, pending, events, errors } = makeFlow(api);
  assert.equal(await runManualReconciliation({ action: 'match', forecastId: 'F', transactionId: 'T' }, flow), 'failed');
  assert.deepEqual(events, ['F:true', 'F:false']);
  assert.equal(pending.size, 0);
  assert.match(errors.at(-1)!, /sign in again/);
});

test('a successful backend write with failed refresh does not invent a local match', async () => {
  const api = createReconciliationApi({
    getIdToken: async () => 'token',
    getUrl: () => 'https://example.org/manual-reconciliation-api',
    send: async () => ok('matched'),
  });
  const { flow, pending, errors } = makeFlow(api);
  flow.refreshForecasts = async () => { throw new Error('offline'); };
  assert.equal(await runManualReconciliation({ action: 'match', forecastId: 'F', transactionId: 'T' }, flow), 'success');
  assert.equal(pending.size, 0);
  assert.match(errors.at(-1)!, /saved, but activity could not be refreshed/);
});

test('overlapping authoritative forecast refreshes discard an older response', async () => {
  const refresh = createLatestReconciliationRefresh<string>();
  const applied: string[] = [];
  let resolveOlder!: (value: string) => void;
  const older = refresh(() => new Promise<string>((resolve) => { resolveOlder = resolve; }), (value) => applied.push(value));
  await refresh(async () => 'new match', (value) => applied.push(value));
  resolveOlder('old match');
  await older;
  assert.deepEqual(applied, ['new match']);
});

test('a network failure leaves prior display alone, clears pending, and permits retry', async () => {
  let calls = 0;
  const api = createReconciliationApi({
    getIdToken: async () => 'token',
    getUrl: () => 'https://example.org/manual-reconciliation-api',
    send: async () => { calls++; throw new Error('offline'); },
  });
  const { flow, pending, events, errors } = makeFlow(api);
  const action = { action: 'match', forecastId: 'F', transactionId: 'T' } as const;
  assert.equal(await runManualReconciliation(action, flow), 'failed');
  assert.equal(await runManualReconciliation(action, flow), 'failed');
  assert.equal(calls, 2);
  assert.equal(pending.size, 0);
  assert.equal(events.filter((event) => event === 'refresh:forecasts').length, 2);
  assert.match(errors.at(-1)!, /could not confirm/);
});

test('a legacy matched forecast still renders its transaction without provenance fields', () => {
  const forecast: Forecast = {
    id: 'F', user_id: 'owner', name: 'Rent', date: '2026-09-01',
    amount: 1500, created_at: '2026-08-01', matched_transaction_id: 'T',
  };
  const transaction: Transaction = {
    id: 'T', amount: 1500, date: '2026-09-01', counterparty_name: 'Rent',
  };
  assert.equal(getMatchedTransactionIds([forecast]).has('T'), true);
  assert.deepEqual(buildActivityItems([transaction], [forecast]).map((item) => item.type), ['transaction']);
});