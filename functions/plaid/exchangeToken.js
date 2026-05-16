const { getPlaidClient } = require('../lib/plaidClient');
const { CountryCode } = require('plaid');

/**
 * Handler for POST /api/plaid/exchange-token
 * Swaps the one-time public token for a permanent access token,
 * fetches account details, and returns them to the frontend to save in Firestore.
 *
 * @param {string} uid - Verified Firebase Auth user ID from the gateway
 * @param {import("firebase-functions/v2/https").Request} req
 * @param {import("firebase-functions/v2/https").Response} res
 */
async function handler(uid, req, res) {
  try {
    const { publicToken } = req.body;
    if (!publicToken) {
      return res.status(400).json({ error: 'publicToken is required' });
    }

    const client = await getPlaidClient();

    const exchangeResponse = await client.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

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
    console.error('Error exchanging token:', error?.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to exchange token' });
  }
}

module.exports = { handler };
