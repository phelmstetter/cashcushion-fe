const { getPlaidClient } = require('../lib/plaidClient');
const { CountryCode } = require('plaid');
const { getFirestore } = require('firebase-admin/firestore');
const {
  getApprovedRedirectUri,
  hasValidRedirectUri,
  logPlaidError,
  publicError,
} = require('../lib/bankingSecurity');

/**
 * Handler for POST /api/plaid/create-update-link-token
 * Generates a Plaid Link token in account-selection update mode for an
 * existing item, letting the user add or remove accounts without re-linking.
 *
 * @param {string} uid - Verified Firebase Auth user ID from the gateway
 * @param {import("firebase-functions/v2/https").Request} req
 * @param {import("firebase-functions/v2/https").Response} res
 */
async function handler(uid, req, res) {
  try {
    const { itemId, redirectUri } = req.body;
    if (!itemId) {
      return publicError(res, 400, 'Please choose a bank connection and try again.');
    }
    if (!hasValidRedirectUri(redirectUri)) {
      return publicError(res, 400, 'This bank connection redirect is not allowed.');
    }
    const approvedRedirectUri = getApprovedRedirectUri(redirectUri);

    const db = getFirestore();
    const itemDoc = await db.collection('plaid_items').doc(itemId).get();
    if (!itemDoc.exists) {
      return publicError(res, 404, 'This bank connection is no longer available. Please link it again.');
    }

    const itemData = itemDoc.data();
    if (itemData.user_id !== uid) {
      return publicError(res, 403, 'You do not have access to this bank connection.');
    }
    if (itemData.deactivated_at) {
      return publicError(res, 404, 'This bank connection is no longer available. Please link it again.');
    }
    if (!itemData.access_token) {
      return publicError(res, 422, 'This bank needs to be linked again before it can be updated.');
    }

    const accessToken = itemData.access_token;

    const client = await getPlaidClient();
    const response = await client.linkTokenCreate({
      user: { client_user_id: uid },
      update: { account_selection_enabled: true },
      client_name: 'Cash Cushion',
      access_token: accessToken,
      country_codes: [CountryCode.Us],
      language: 'en',
      // Required for institutions that use an OAuth login step (most major US
      // banks). Without it, Link redirects the user to the bank's OAuth page
      // and has no way to hand control back to the app. Must exactly match a
      // URI registered in the Plaid Dashboard's "Allowed redirect URIs".
      ...(approvedRedirectUri ? { redirect_uri: approvedRedirectUri } : {}),
    });

    return res.status(200).json({ link_token: response.data.link_token });
  } catch (error) {
    logPlaidError('create-update-link-token', error);
    return publicError(res, 502, 'We couldn’t start the account update. Please try again.');
  }
}

module.exports = { handler };
