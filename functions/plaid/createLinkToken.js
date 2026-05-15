const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid');

let plaidClient = null;

function getPlaidClient() {
  if (plaidClient) return plaidClient;

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = (process.env.PLAID_ENV || 'sandbox').toLowerCase();

  const envMap = {
    sandbox: PlaidEnvironments.sandbox,
    development: PlaidEnvironments.development,
    production: PlaidEnvironments.production,
  };

  const configuration = new Configuration({
    basePath: envMap[env] || PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  });

  plaidClient = new PlaidApi(configuration);
  return plaidClient;
}

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
    const client = getPlaidClient();

    const response = await client.linkTokenCreate({
      user: { client_user_id: uid },
      client_name: 'Cash Cushion',
      products: [Products.Transactions],
      transactions: { days_requested: 730 },
      country_codes: [CountryCode.Us],
      language: 'en',
      account_filters: {
        depository: {
          account_subtypes: ['checking', 'savings'],
        },
      },
    });

    return res.status(200).json({ link_token: response.data.link_token });
  } catch (error) {
    console.error('Error creating link token:', error?.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to create link token' });
  }
}

module.exports = { handler };
