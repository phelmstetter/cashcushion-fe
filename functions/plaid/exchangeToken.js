/**
 * Stub handler for POST /api/plaid/exchange-token
 * The verified uid is injected by the gateway — never read from req.body.
 * Real Plaid logic will be added in the next task.
 *
 * @param {string} uid - Verified Firebase Auth user ID from the gateway
 * @param {import("firebase-functions/v2/https").Request} req
 * @param {import("firebase-functions/v2/https").Response} res
 */
async function handler(uid, req, res) {
  return res.status(200).json({ ok: true, handler: "exchangeToken", uid });
}

module.exports = { handler };
