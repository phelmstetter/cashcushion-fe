const { getPlaidClient } = require('../lib/plaidClient');
const { CountryCode } = require('plaid');
const { getFirestore } = require('firebase-admin/firestore');

/**
 * Handler for POST /api/plaid/refresh-accounts
 * Fetches the current account list for an existing Plaid item and returns
 * it in the same shape as exchange-token so the frontend can re-save.
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
    const accessToken = itemDoc.data().access_token;

    const client = await getPlaidClient();
    const [accountsResponse, itemResponse] = await Promise.all([
      client.accountsGet({ access_token: accessToken }),
      client.itemGet({ access_token: accessToken }),
    ]);

    const institutionId = itemResponse.data.item.institution_id || null;
    let institutionName = null;
    if (institutionId) {
      try {
        const instResponse = await client.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
        });
        institutionName = instResponse.data.institution.name;
      } catch {
        institutionName = null;
      }
    }

    const accounts = accountsResponse.data.accounts.map((acct) => ({
      account_id: acct.account_id,
      name: acct.name,
      official_name: acct.official_name || null,
      mask: acct.mask || '',
      type: acct.type,
      subtype: acct.subtype || null,
      available_balance: acct.balances.available ?? null,
      current_balance: acct.balances.current ?? null,
    }));

    return res.status(200).json({
      item_id: itemId,
      institution_id: institutionId,
      institution_name: institutionName,
      accounts,
    });
  } catch (error) {
    console.error('Error refreshing accounts:', error?.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to refresh accounts' });
  }
}

module.exports = { handler };
