const { initializeApp } = require("firebase-admin/app");
const { onRequest } = require("firebase-functions/v2/https");
const { verifyAuth } = require("./middleware/auth");
const createLinkToken = require("./plaid/createLinkToken");
const exchangeToken = require("./plaid/exchangeToken");

initializeApp();

/**
 * Route table: maps "METHOD /path" to a handler module.
 * Each handler receives (uid, req, res).
 */
const routes = {
  "POST /api/plaid/create-link-token": createLinkToken.handler,
  "POST /api/plaid/exchange-token": exchangeToken.handler,
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
  },
  async (req, res) => {
    const routeKey = `${req.method} ${req.path}`;

    const handler = routes[routeKey];
    if (!handler) {
      return res.status(404).json({ error: `No handler for ${routeKey}` });
    }

    const decoded = await verifyAuth(req);
    if (!decoded) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      await handler(decoded.uid, req, res);
    } catch (err) {
      console.error(`[gateway] Unhandled error in handler for ${routeKey}:`, err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);
