const { getPlaidClient } = require('../lib/plaidClient');
const { Products, CountryCode } = require('plaid');

/**
 * Handler for POST /api/plaid/create-link-token
 * Calls Plaid to generate a short-lived link token for the frontend.
 *
 * @param {string} uid - Verified Firebase Auth user ID from the gateway
 * @param {import("firebase-functions/v2/https").Request} req
 * @param {import("firebase-functions/v2/https").Response} res
 */
async function handler(uid, req, res) {
  try {
    const { redirectUri } = req.body;
    const client = await getPlaidClient();

    const response = await client.linkTokenCreate({
      user: { client_user_id: uid },
      client_name: 'Cash Cushion',
      webhook: 'https://plaid.webhook.cashcushion.net/',
      products: [Products.Transactions],
      transactions: { days_requested: 730 },
      country_codes: [CountryCode.Us],
      language: 'en',
      account_filters: {
        depository: {
          account_subtypes: ['checking', 'savings'],
        },
      },
      // Required for institutions that use an OAuth login step (most major US
      // banks). Without it, Link redirects the user to the bank's OAuth page
      // and has no way to hand control back to the app. Must exactly match a
      // URI registered in the Plaid Dashboard's "Allowed redirect URIs".
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    });

    return res.status(200).json({ link_token: response.data.link_token });
  } catch (error) {
    const plaidError = error?.response?.data;
    console.error('Error creating link token:', plaidError || error.message);
    return res.status(500).json({
      error: 'Failed to create link token',
      // Surfaced so the client-visible error is actionable instead of opaque —
      // this is safe to expose: it's Plaid's own error taxonomy, not secrets.
      plaid_error_code: plaidError?.error_code,
      plaid_error_message: plaidError?.error_message,
    });
  }
}

module.exports = { handler };
