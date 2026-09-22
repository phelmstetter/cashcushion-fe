import assert from "node:assert/strict";
import test from "node:test";
import { getDashboardContentPadding } from "./dashboardLayout";

test("reserves content space below the fixed header with one account", () => {
  assert.equal(getDashboardContentPadding(314), 320);
});

test("reserves additional content space when multiple account rows enlarge the fixed header", () => {
  assert.equal(getDashboardContentPadding(482.2), 489);
});