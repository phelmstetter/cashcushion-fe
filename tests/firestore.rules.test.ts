import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { after, before, beforeEach } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const ownerId = "forecast-owner";
const otherUserId = "another-user";
const projectId = "demo-forecast-rules";
const baseForecast = {
  user_id: ownerId,
  name: "Monthly rent",
  date: "2026-09-01",
  amount: 1500,
  created_at: "2026-08-01T00:00:00.000Z",
  account_id: "checking-a",
};
const backendLifecycleFields = {
  extend: true,
  extended: false,
  extended_from_forecast_id: "original-forecast",
};
const backendFieldCases = [
  ["extend", true, false],
  ["extended", false, true],
  ["extended_from_forecast_id", "original-forecast", "another-forecast"],
] as const;

let testEnv: RulesTestEnvironment;

before(async () => {
  const rules = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules,
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "forecasts", "migrated-forecast"), {
      ...baseForecast,
      ...backendLifecycleFields,
      matched_transaction_id: "same-account-transaction",
      match_source: "manual",
      match_engine_version: 2,
      match_confidence_score: 0.9,
    });
    await setDoc(doc(db, "forecasts", "legacy-matched"), {
      ...baseForecast,
      matched_transaction_id: "same-account-transaction",
    });
    await setDoc(doc(db, "transactions", "same-account-transaction"), {
      user_id: ownerId,
      account_id: "checking-a",
      amount: 1500,
      date: "2026-09-01",
    });
    await setDoc(doc(db, "transactions", "different-account-transaction"), {
      user_id: ownerId,
      account_id: "savings-b",
      amount: 1500,
      date: "2026-09-01",
    });
    await setDoc(doc(db, "transactions", "other-user-transaction"), {
      user_id: otherUserId,
      account_id: "checking-a",
      amount: 1500,
      date: "2026-09-01",
    });
  });
});

test("an owner can edit normal matched fields but cannot move or delete an active match", async () => {
  const db = testEnv.authenticatedContext(ownerId).firestore();
  const forecastRef = doc(db, "forecasts", "migrated-forecast");

  const beforeEdit = await assertSucceeds(getDoc(forecastRef));
  assert.equal(beforeEdit.data()?.extend, true);
  assert.equal(beforeEdit.data()?.extended, false);
  assert.equal(beforeEdit.data()?.extended_from_forecast_id, "original-forecast");

  await assertSucceeds(updateDoc(forecastRef, {
    date: "2026-10-01",
    amount: 1600,
    name: "Updated rent",
    forecast_type: "every_x_days",
    forecast_interval: 30,
    auto_extend: true,
  }));

  const afterEdit = await assertSucceeds(getDoc(forecastRef));
  assert.equal(afterEdit.data()?.date, "2026-10-01");
  assert.equal(afterEdit.data()?.amount, 1600);
  assert.equal(afterEdit.data()?.forecast_type, "every_x_days");
  assert.equal(afterEdit.data()?.auto_extend, true);
  assert.equal(afterEdit.data()?.matched_transaction_id, "same-account-transaction");
  assert.equal(afterEdit.data()?.match_source, "manual");
  assert.deepEqual(
    {
      extend: afterEdit.data()?.extend,
      extended: afterEdit.data()?.extended,
      extended_from_forecast_id: afterEdit.data()?.extended_from_forecast_id,
    },
    backendLifecycleFields,
  );

  await assertFails(updateDoc(forecastRef, { account_id: "checking-b" }));
  await assertFails(deleteDoc(forecastRef));
  const unmatchedRef = doc(db, "forecasts", "owner-forecast");
  await assertSucceeds(setDoc(unmatchedRef, baseForecast));
  await assertSucceeds(updateDoc(unmatchedRef, { account_id: "checking-b" }));
  await assertSucceeds(deleteDoc(unmatchedRef));
});

test("browser clients cannot create, add, change, or remove backend lifecycle fields", async () => {
  const db = testEnv.authenticatedContext(ownerId).firestore();

  await assertFails(setDoc(doc(db, "forecasts", "client-with-lifecycle"), {
    ...baseForecast,
    ...backendLifecycleFields,
  }));

  for (const [index, [field, initialValue, changedValue]] of backendFieldCases.entries()) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, "forecasts", `legacy-${index}`), baseForecast);
      await setDoc(doc(adminDb, "forecasts", `migrated-${index}`), {
        ...baseForecast,
        [field]: initialValue,
      });
    });

    await assertFails(setDoc(doc(db, "forecasts", `client-create-${index}`), {
      ...baseForecast,
      [field]: initialValue,
    }));
    await assertFails(updateDoc(doc(db, "forecasts", `legacy-${index}`), {
      [field]: initialValue,
    }));
    await assertFails(updateDoc(doc(db, "forecasts", `migrated-${index}`), {
      [field]: changedValue,
    }));
    await assertFails(updateDoc(doc(db, "forecasts", `migrated-${index}`), {
      [field]: deleteField(),
    }));
  }
});

test("another user cannot read, edit, or delete the forecast", async () => {
  const db = testEnv.authenticatedContext(otherUserId).firestore();
  const forecastRef = doc(db, "forecasts", "migrated-forecast");

  await assertFails(getDoc(forecastRef));
  await assertFails(updateDoc(forecastRef, { amount: 1 }));
  await assertFails(deleteDoc(forecastRef));
});

test("an owner can still create a legacy client forecast with auto_extend", async () => {
  const db = testEnv.authenticatedContext(ownerId).firestore();

  await assertSucceeds(setDoc(doc(db, "forecasts", "legacy-client-forecast"), {
    ...baseForecast,
    auto_extend: true,
    forecast_type: "monthly",
    series_id: "rent-series",
  }));
});

test("browser clients cannot directly create, add, change, or remove any reconciliation field", async () => {
  const db = testEnv.authenticatedContext(ownerId).firestore();
  const fields = [
    ["matched_transaction_id", "same-account-transaction", "different-account-transaction"],
    ["match_source", "manual", "auto"],
    ["match_engine_version", 2, 3],
    ["match_confidence_score", 0.9, 0.5],
  ] as const;

  for (const [index, [field, initialValue, changedValue]] of fields.entries()) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "forecasts", `no-reconciliation-${index}`), baseForecast);
    });
    await assertFails(setDoc(doc(db, "forecasts", `create-reconciliation-${index}`), {
      ...baseForecast, [field]: initialValue,
    }));
    await assertFails(updateDoc(doc(db, "forecasts", `no-reconciliation-${index}`), {
      [field]: initialValue,
    }));
    await assertFails(updateDoc(doc(db, "forecasts", "migrated-forecast"), {
      [field]: changedValue,
    }));
    await assertFails(updateDoc(doc(db, "forecasts", "migrated-forecast"), {
      [field]: deleteField(),
    }));
  }
  await assertFails(updateDoc(doc(db, "forecasts", "migrated-forecast"), {
    matched_transaction_id: null,
  }));
});

test("transactions and learning/evidence collections cannot be changed by browser clients", async () => {
  const db = testEnv.authenticatedContext(ownerId).firestore();
  await assertFails(setDoc(doc(db, "transactions", "new-claim"), {
    user_id: ownerId, account_id: "checking-a", reconciliation_claimed: true,
  }));
  await assertFails(updateDoc(doc(db, "transactions", "same-account-transaction"), {
    reconciliation_claimed: true,
  }));
  await assertFails(deleteDoc(doc(db, "transactions", "same-account-transaction")));

  for (const name of [
    "user_reconciliation_feedback",
    "reconciliation_profiles",
    "global_reconciliation_evidence",
    "global_reconciliation_contributions",
  ]) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), name, "existing"), { user_id: ownerId });
    });
    await assertFails(setDoc(doc(db, name, "new"), { user_id: ownerId }));
    await assertFails(updateDoc(doc(db, name, "existing"), { status: "changed" }));
    await assertFails(deleteDoc(doc(db, name, "existing")));
  }
});

test("an owner can read and edit a legacy matched forecast without provenance fields", async () => {
  const db = testEnv.authenticatedContext(ownerId).firestore();
  const forecastRef = doc(db, "forecasts", "legacy-matched");
  assert.equal((await assertSucceeds(getDoc(forecastRef))).data()?.matched_transaction_id, "same-account-transaction");
  await assertSucceeds(updateDoc(forecastRef, { name: "Updated rent", amount: 1550 }));
  const result = await assertSucceeds(getDoc(forecastRef));
  assert.equal(result.data()?.matched_transaction_id, "same-account-transaction");
  assert.equal(result.data()?.match_source, undefined);
});