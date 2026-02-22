import type { Express } from "express";
import { createServer, type Server } from "http";
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import { getPlaidSecrets } from "./lib/secrets";

let plaidClient: PlaidApi | null = null;

async function getPlaidClient(): Promise<PlaidApi> {
  if (plaidClient) return plaidClient;

  const { clientId, secret, env } = await getPlaidSecrets();

  const envMap: Record<string, string> = {
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post('/api/plaid/create-link-token', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      const client = await getPlaidClient();

      const response = await client.linkTokenCreate({
        user: { client_user_id: userId },
        client_name: 'Cash Cushion',
        products: [Products.Transactions],
        transactions: { days_requested: 730 },
        country_codes: [CountryCode.Us],
        language: 'en',
        account_filters: {
          depository: {
            account_subtypes: ['checking' as any, 'savings' as any],
          },
        },
      });

      res.json({ link_token: response.data.link_token });
    } catch (error: any) {
      console.error('Error creating link token:', error?.response?.data || error.message);
      res.status(500).json({ error: 'Failed to create link token' });
    }
  });

  app.post('/api/plaid/exchange-token', async (req, res) => {
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

      const accountsResponse = await client.accountsGet({
        access_token: accessToken,
      });

      const itemResponse = await client.itemGet({
        access_token: accessToken,
      });

      const institutionId = itemResponse.data.item.institution_id || null;
      let institutionName: string | null = null;

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

      res.json({
        item_id: itemId,
        institution_id: institutionId,
        institution_name: institutionName,
        accounts,
      });
    } catch (error: any) {
      console.error('Error exchanging token:', error?.response?.data || error.message);
      res.status(500).json({ error: 'Failed to exchange token' });
    }
  });

  return httpServer;
}
