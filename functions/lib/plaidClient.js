const { getStorage } = require('firebase-admin/storage');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

let plaidClient = null;

async function getPlaidEnv() {
  const bucket = getStorage().bucket('cashcushion.appspot.com');
  const file = bucket.file('plaid_env');
  const [contents] = await file.download();
  return contents.toString('utf8').trim().toLowerCase();
}

async function getPlaidClient() {
  if (plaidClient) return plaidClient;

  const secrets = JSON.parse(process.env.PLAID_SECRETS);
  const clientId = secrets.client_id;

  const env = await getPlaidEnv();

  // Key names in the secret JSON: sandbox_secret, dev_secret, prod_secret
  const keyMap = {
    sandbox: 'sandbox_secret',
    development: 'dev_secret',
    dev: 'dev_secret',
    production: 'prod_secret',
    prod: 'prod_secret',
  };
  const secretKey = secrets[keyMap[env]];
  if (!secretKey) {
    throw new Error(`No Plaid secret found for environment: ${env}`);
  }

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
        'PLAID-SECRET': secretKey,
      },
    },
  });

  plaidClient = new PlaidApi(configuration);
  return plaidClient;
}

module.exports = { getPlaidClient };
