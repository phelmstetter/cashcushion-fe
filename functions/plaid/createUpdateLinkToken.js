const { getPlaidClient } = require('../lib/plaidClient');
const { CountryCode } = require('plaid');
const { getFirestore } = require('firebase-admin/firestore');

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
    const { itemId } = req.body;
    if (!itemId) {
      return res.status(400).json({ error: 'itemId is required' });
    }

    const db = getFirestore();
    const itemDoc = await db.collection('plaid_items').doc(itemId).get();
    if (!itemDoc.exists) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const itemData = itemDoc.data();
    if (itemData.user_id !== uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!itemData.access_token) {
      return res.status(422).json({ error: 'Access token missing — try re-linking the bank' });
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
    });

    return res.status(200).json({ link_token: response.data.link_token });
  } catch (error) {
    console.error('Error creating update link token:', error?.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to create update link token' });
  }
}

module.exports = { handler };
