const assert = require("node:assert/strict");
const test = require("node:test");
const {
  getApprovedRedirectUri,
  hasValidRedirectUri,
  publicError,
  validateRequest,
} = require("../lib/bankingSecurity");
const { verifyAuth } = require("../middleware/auth");

test("rejects banking requests without a Firebase bearer token", async () => {
  assert.equal(await verifyAuth({ headers: {} }), null);
  assert.equal(await verifyAuth({ headers: { authorization: "Basic not-a-token" } }), null);
});

test("accepts only exact HTTPS redirect allowlist entries", () => {
  process.env.PLAID_ALLOWED_REDIRECT_URIS = "https://app.example.com/linked-accounts";

  assert.equal(
    getApprovedRedirectUri("https://app.example.com/linked-accounts"),
    "https://app.example.com/linked-accounts",
  );
  assert.equal(getApprovedRedirectUri("http://app.example.com/linked-accounts"), null);
  assert.equal(getApprovedRedirectUri("https://app.example.com/linked-accounts?next=/"), null);
  assert.equal(hasValidRedirectUri(undefined), true);
  assert.equal(hasValidRedirectUri("https://attacker.example/linked-accounts"), false);
});

test("public errors never include diagnostic details", () => {
  let status;
  let response;
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(body) {
      response = body;
      return body;
    },
  };

  publicError(res, 429, "Too many banking requests. Please wait and try again.", 30);
  assert.equal(status, 429);
  assert.deepEqual(response, {
    error: "Too many banking requests. Please wait and try again.",
    retry_after_seconds: 30,
  });
  assert.equal(JSON.stringify(response).includes("plaid"), false);
});

test("rejects oversized banking requests before a handler can run", () => {
  let status;
  let response;
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(body) {
      response = body;
      return body;
    },
  };

  assert.equal(validateRequest({
    headers: { "content-length": String(16 * 1024 + 1) },
    body: { itemId: "item" },
  }, res), false);
  assert.equal(status, 413);
  assert.equal(response.error, "This request is too large. Please try again.");
});