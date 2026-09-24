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

test("an owner can read, edit, and delete a forecast with backend lifecycle fields", async () => {
  const db = testEnv.authenticatedContext(ownerId).firestore();
  const forecastRef = doc(db, "forecasts", "migrated-forecast");

  const beforeEdit = await assertSucceeds(getDoc(forecastRef));
  assert.equal(beforeEdit.data()?.extend, true);
  assert.equal(beforeEdit.data()?.extended, false);
  assert.equal(beforeEdit.data()?.extended_from_forecast_id, "original-forecast");

  await assertSucceeds(updateDoc(forecastRef, {
    date: "2026-10-01",
    amount: 1600,
  }));

  const afterEdit = await assertSucceeds(getDoc(forecastRef));
  assert.equal(afterEdit.data()?.date, "2026-10-01");
  assert.equal(afterEdit.data()?.amount, 1600);
  assert.deepEqual(
    {
      extend: afterEdit.data()?.extend,
      extended: afterEdit.data()?.extended,
      extended_from_forecast_id: afterEdit.data()?.extended_from_forecast_id,
    },
    backendLifecycleFields,
  );

  await assertSucceeds(deleteDoc(forecastRef));
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

test("matching requires the owner's same-account transaction; unmatching remains allowed", async () => {
  const db = testEnv.authenticatedContext(ownerId).firestore();
  const forecastRef = doc(db, "forecasts", "migrated-forecast");

  await assertSucceeds(updateDoc(forecastRef, {
    matched_transaction_id: "same-account-transaction",
  }));
  await assertSucceeds(updateDoc(forecastRef, {
    matched_transaction_id: null,
  }));

  await assertFails(updateDoc(forecastRef, {
    matched_transaction_id: "different-account-transaction",
  }));
  await assertFails(updateDoc(forecastRef, {
    matched_transaction_id: "other-user-transaction",
  }));
});