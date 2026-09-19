const { initializeApp } = require("firebase-admin/app");
const { onRequest } = require("firebase-functions/v2/https");
const { verifyAuth } = require("./middleware/auth");
const createLinkToken = require("./plaid/createLinkToken");
const exchangeToken = require("./plaid/exchangeToken");
const removeItem = require("./plaid/removeItem");
const createUpdateLinkToken = require("./plaid/createUpdateLinkToken");
const refreshAccounts = require("./plaid/refreshAccounts");
const syncItem = require("./plaid/syncItem");
const {
  acquireOperation,
  publicError,
  releaseOperation,
  validateRequest,
} = require("./lib/bankingSecurity");

initializeApp();

/**
 * Route table: maps "METHOD /path" to a handler module.
 * Each handler receives (uid, req, res). The operation name is used for
 * persistent per-user rate limits and an in-flight lease.
 */
const routes = {
  "POST /api/plaid/create-link-token": { operation: "create-link-token", handler: createLinkToken.handler },
  "POST /api/plaid/exchange-token": { operation: "exchange-token", handler: exchangeToken.handler },
  "POST /api/plaid/remove-item": { operation: "remove-item", handler: removeItem.handler },
  "POST /api/plaid/create-update-link-token": { operation: "create-update-link-token", handler: createUpdateLinkToken.handler },
  "POST /api/plaid/refresh-accounts": { operation: "refresh-accounts", handler: refreshAccounts.handler },
  "POST /api/plaid/sync-item": { operation: "sync-item", handler: syncItem.handler },
};

/**
 * gateway — the single publicly exposed Cloud Function.
 *
 * Security layers (in order):
 *   1. App Check — enforced automatically by Firebase Gen 2 via enforceAppCheck: true.
 *      Requests without a valid App Check token are rejected before this code runs.
 *   2. Firebase Auth — gateway verifies the ID token in the Authorization header.
 *      The verified uid is passed into every handler; handlers never trust req.body.uid.
 *
 * Routing:
 *   Matches "METHOD /path" against the route table above.
 *   Unmatched routes return 404.
 */
exports.gateway = onRequest(
  {
    enforceAppCheck: true,
    cors: true,
    timeoutSeconds: 30,
    maxInstances: 10,
  },
  async (req, res) => {
    const routeKey = `${req.method} ${req.path}`;

    const handler = routes[routeKey];
    if (!handler) {
      return publicError(res, 404, "This banking action is not available.");
    }

    const decoded = await verifyAuth(req);
    if (!decoded) {
      return publicError(res, 401, "Please sign in and try again.");
    }

    if (!validateRequest(req, res)) return;

    const operationLease = await acquireOperation(decoded.uid, handler.operation);
    if (!operationLease.allowed) {
      return publicError(
        res,
        operationLease.status,
        operationLease.status === 409
          ? "This banking action is already in progress. Please wait."
          : "Too many banking requests. Please wait and try again.",
        operationLease.retryAfterSeconds,
      );
    }

    try {
      // Do not release the operation lease until the underlying side effect
      // actually settles. Function-level timeoutSeconds bounds hung work.
      await handler.handler(decoded.uid, req, res);
    } catch (err) {
      console.error(`[gateway] Unhandled error in handler for ${routeKey}:`, err);
      return publicError(res, 500, "We couldn't complete that banking action. Please try again.");
    } finally {
      try {
        await releaseOperation(decoded.uid, handler.operation, operationLease.leaseId);
      } catch (err) {
        console.error(`[gateway] Failed to release ${handler.operation} lease:`, err);
      }
    }
  }
);
