export type ReconciliationAction =
  | { action: 'match'; forecastId: string; transactionId: string }
  | { action: 'unmatch'; forecastId: string };

export class ReconciliationError extends Error {
  constructor(public readonly code: string, public readonly status?: number) {
    super(code);
    this.name = 'ReconciliationError';
  }
}

type ApiOptions = {
  getIdToken: () => Promise<string | null>;
  getUrl: () => string | undefined;
  send: typeof fetch;
};

export function createReconciliationApi({ getIdToken, getUrl, send }: ApiOptions) {
  async function post(action: ReconciliationAction): Promise<void> {
    let token: string | null;
    try {
      token = await getIdToken();
    } catch {
      throw new ReconciliationError('authentication_unavailable');
    }
    if (!token) throw new ReconciliationError('unauthenticated');

    const url = getUrl()?.trim();
    if (!url || !/^https?:\/\/[^/]+/i.test(url)) {
      throw new ReconciliationError('configuration_missing');
    }

    const body = action.action === 'match'
      ? { action: 'match', forecast_id: action.forecastId, transaction_id: action.transactionId }
      : { action: 'unmatch', forecast_id: action.forecastId };

    let response: Response;
    try {
      response = await send(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ReconciliationError('network_error');
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new ReconciliationError('unexpected_response', response.status);
    }
    if (typeof result !== 'object' || result === null) {
      throw new ReconciliationError('unexpected_response', response.status);
    }
    const payload = result as { ok?: unknown; status?: unknown; error?: { code?: unknown } };
    if (!response.ok || payload.ok !== true) {
      const code = typeof payload.error?.code === 'string'
        ? payload.error.code
        : 'unexpected_response';
      throw new ReconciliationError(code, response.status);
    }
    const allowedStatuses = action.action === 'match'
      ? ['matched']
      : ['unmatched', 'already_unmatched'];
    if (!allowedStatuses.includes(String(payload.status))) {
      throw new ReconciliationError('unexpected_response', response.status);
    }
  }

  return {
    manualMatch: (forecastId: string, transactionId: string) =>
      post({ action: 'match', forecastId, transactionId }),
    manualUnmatch: (forecastId: string) => post({ action: 'unmatch', forecastId }),
  };
}

type ReconciliationApi = ReturnType<typeof createReconciliationApi>;

/** Prevent an older Firestore query from replacing a newer authoritative snapshot. */
export function createLatestReconciliationRefresh<T>() {
  let latest = 0;
  return async (load: () => Promise<T>, apply: (value: T) => void): Promise<void> => {
    const request = ++latest;
    try {
      const value = await load();
      if (request === latest) apply(value);
    } catch (error) {
      if (request === latest) throw error;
    }
  };
}

export function reconciliationErrorMessage(error: unknown): string {
  const code = error instanceof ReconciliationError ? error.code : 'unexpected_response';
  switch (code) {
    case 'unauthenticated': return 'Please sign in again to change a match.';
    case 'authentication_unavailable': return 'Reconciliation is temporarily unavailable. Please try again later.';
    case 'configuration_missing': return 'Reconciliation is not configured yet. Please contact support.';
    case 'forecast_not_found': return 'This forecast is no longer available. Please review your updated activity.';
    case 'transaction_not_found': return 'This transaction is no longer available. Please review your updated activity.';
    case 'account_mismatch': return 'That transaction cannot be matched to this forecast.';
    case 'transaction_already_claimed': return 'This transaction has already been matched. Please review your updated activity.';
    case 'concurrent_conflict': return 'Reconciliation changed while you were editing. Please review your updated activity.';
    case 'invalid_existing_match': return 'The current match has changed. Please review your updated activity.';
    case 'network_error': return 'We could not confirm the change. Check your connection and review your activity before trying again.';
    default: return 'We couldn’t complete that change. Please try again.';
  }
}

type ReconciliationFlow = {
  api: ReconciliationApi;
  pending: Set<string>;
  setPending: (forecastId: string, value: boolean) => void;
  setError: (message: string | null) => void;
  refreshForecasts: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
};

export async function runManualReconciliation(
  action: ReconciliationAction,
  flow: ReconciliationFlow,
): Promise<'success' | 'failed' | 'pending'> {
  if (flow.pending.has(action.forecastId)) return 'pending';
  flow.pending.add(action.forecastId);
  flow.setPending(action.forecastId, true);
  flow.setError(null);
  try {
    try {
      if (action.action === 'match') {
        await flow.api.manualMatch(action.forecastId, action.transactionId);
      } else {
        await flow.api.manualUnmatch(action.forecastId);
      }
    } catch (error) {
      const code = error instanceof ReconciliationError ? error.code : '';
      const refresh = [
        'forecast_not_found', 'transaction_not_found', 'transaction_already_claimed',
        'concurrent_conflict', 'invalid_existing_match', 'network_error', 'unexpected_response',
      ].includes(code);
      let refreshFailed = false;
      if (refresh) {
        try {
          await flow.refreshForecasts();
          if (code === 'transaction_not_found' || code === 'transaction_already_claimed' || code === 'concurrent_conflict') {
            await flow.refreshTransactions();
          }
        } catch {
          refreshFailed = true;
        }
      }
      flow.setError(`${reconciliationErrorMessage(error)}${refreshFailed ? ' Reload the page to see the latest activity.' : ''}`);
      return 'failed';
    }

    try {
      await flow.refreshForecasts();
      flow.setError(null);
    } catch {
      flow.setError('The change was saved, but activity could not be refreshed. Reload the page to see the latest match.');
    }
    return 'success';
  } finally {
    flow.pending.delete(action.forecastId);
    flow.setPending(action.forecastId, false);
  }
}