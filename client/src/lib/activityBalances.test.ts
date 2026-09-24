import assert from "node:assert/strict";
import test from "node:test";
import {
  buildActivityItems,
  getForecastBalances,
  getMatchedTransactionIds,
  getTransactionBalances,
  getVisibleForecasts,
  sortActivityItems,
  type ActivityItem,
} from "./activityBalances";
import type { Account, Forecast, Transaction } from "./firebase";

const account = (account_id: string, available_balance: number): Account => ({
  id: account_id,
  account_id,
  mask: "1234",
  name: account_id,
  available_balance,
});

const transaction = (
  id: string,
  account_id: string,
  amount: number
): Transaction => ({
  id,
  account_id,
  amount,
  date: "2026-09-22",
  counterparty_name: id,
});

const forecast = (
  id: string,
  account_id: string,
  amount: number
): Forecast => ({
  id,
  account_id,
  amount,
  date: "2026-09-22",
  user_id: "user",
  name: id,
  created_at: "2026-09-01T00:00:00.000Z",
});

test("same-day actual transactions show each account's earlier balance on lower rows", () => {
  const activityItems = sortActivityItems([
    { type: "transaction", data: transaction("checking-expense", "checking", 20) },
    { type: "transaction", data: transaction("checking-deposit", "checking", -30) },
    { type: "transaction", data: transaction("savings-deposit", "savings", -5) },
    { type: "transaction", data: transaction("savings-expense", "savings", 10) },
  ]);

  assert.deepEqual(
    activityItems.map((item) => item.data.id),
    ["savings-expense", "savings-deposit", "checking-expense", "checking-deposit"]
  );

  const balances = getTransactionBalances(
    [account("checking", 100), account("savings", 50)],
    activityItems
  );

  assert.equal(balances.get("savings-expense"), 50);
  assert.equal(balances.get("savings-deposit"), 60);
  assert.equal(balances.get("checking-expense"), 100);
  assert.equal(balances.get("checking-deposit"), 120);
});

test("same-day forecasts show each account's earlier projected balance on lower rows", () => {
  const activityItems: ActivityItem[] = sortActivityItems([
    { type: "forecast", data: forecast("checking-income", "checking", -10) },
    { type: "forecast", data: forecast("checking-expense", "checking", 20) },
    { type: "forecast", data: forecast("savings-income", "savings", -25) },
    { type: "forecast", data: forecast("savings-expense", "savings", 15) },
  ]);

  assert.deepEqual(
    activityItems.map((item) => item.data.id),
    ["savings-income", "savings-expense", "checking-income", "checking-expense"]
  );

  const endingBalances = new Map([
    ["checking", 70],
    ["savings", 200],
  ]);
  const balances = getForecastBalances(
    activityItems,
    (item) => endingBalances.get(item.account_id ?? "")
  );

  assert.equal(balances.get("savings-income"), 200);
  assert.equal(balances.get("savings-expense"), 175);
  assert.equal(balances.get("checking-income"), 70);
  assert.equal(balances.get("checking-expense"), 60);
});

test("matching a forecast keeps the actual visible and marks its transaction as matched", () => {
  const actual = transaction("actual", "checking", 35);
  const matchedForecast = {
    ...forecast("matched-forecast", "checking", 35),
    matched_transaction_id: actual.id,
  };
  const pendingForecast = forecast("pending-forecast", "checking", 25);

  const activityItems = buildActivityItems(
    [actual],
    [matchedForecast, pendingForecast]
  );

  assert.deepEqual(
    activityItems.map((item) => `${item.type}:${item.data.id}`),
    ["forecast:pending-forecast", "transaction:actual"]
  );
  assert.deepEqual(
    getVisibleForecasts([matchedForecast, pendingForecast]).map((item) => item.id),
    ["pending-forecast"]
  );
  assert.equal(getMatchedTransactionIds([matchedForecast]).has(actual.id), true);
});