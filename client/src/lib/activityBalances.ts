import type { Account, Forecast, Transaction } from "./firebase";

export type ActivityItem =
  | { type: "transaction"; data: Transaction }
  | { type: "forecast"; data: Forecast };

const getActivityItemId = (item: ActivityItem) => item.data.id ?? "";

/**
 * Orders activity exactly as it appears in the dashboard. The ID tie-breaker
 * matches the Firestore queries, so balance calculations remain stable when
 * several rows have the same date.
 */
export function sortActivityItems(items: ActivityItem[]): ActivityItem[] {
  return [...items].sort((first, second) => {
    const dateOrder = second.data.date.localeCompare(first.data.date);
    if (dateOrder !== 0) return dateOrder;

    if (first.type !== second.type) {
      return first.type === "forecast" ? -1 : 1;
    }

    return getActivityItemId(second).localeCompare(getActivityItemId(first));
  });
}

export function getTransactionBalances(
  accounts: Account[],
  activityItems: ActivityItem[]
): Map<string, number | null> {
  const balanceByAccount = new Map<string, number | null>();
  const balanceByTransaction = new Map<string, number | null>();

  for (const account of accounts) {
    const balance = account.available_balance ?? account.current_balance ?? null;
    balanceByAccount.set(
      account.account_id,
      typeof balance === "number" && Number.isFinite(balance) ? balance : null
    );
  }

  for (const item of activityItems) {
    if (item.type !== "transaction") continue;

    const transaction = item.data;
    const accountId = transaction.account_id;
    const balance = accountId ? balanceByAccount.get(accountId) ?? null : null;
    balanceByTransaction.set(transaction.id, balance);

    if (accountId && balance != null && Number.isFinite(transaction.amount)) {
      balanceByAccount.set(accountId, balance + transaction.amount);
    }
  }

  return balanceByTransaction;
}

export function getForecastBalances(
  activityItems: ActivityItem[],
  getDayEndingBalance: (forecast: Forecast) => number | null | undefined
): Map<string, number | null> {
  const balanceByAccountDate = new Map<string, number | null>();
  const balanceByForecast = new Map<string, number | null>();

  for (const item of activityItems) {
    if (item.type !== "forecast") continue;

    const forecast = item.data;
    if (!forecast.id || !forecast.account_id) continue;

    const balanceKey = `${forecast.account_id}:${forecast.date}`;
    const balance = balanceByAccountDate.has(balanceKey)
      ? balanceByAccountDate.get(balanceKey) ?? null
      : getDayEndingBalance(forecast) ?? null;

    balanceByForecast.set(
      forecast.id,
      typeof balance === "number" && Number.isFinite(balance) ? balance : null
    );

    if (balance != null && Number.isFinite(forecast.amount)) {
      balanceByAccountDate.set(balanceKey, balance + forecast.amount);
    }
  }

  return balanceByForecast;
}