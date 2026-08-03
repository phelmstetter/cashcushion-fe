const { getStorage } = require('firebase-admin/storage');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

// Cached per environment name, not globally — so switching the `plaid_env`
// file (e.g. sandbox -> production) takes effect on the next call instead of
// being stuck with whichever client a warm instance built first.
let cachedEnv = null;
let cachedClient = null;

async function getPlaidEnv() {
  const bucket = getStorage().bucket('cashcushion.appspot.com');
  const file = bucket.file('plaid_env');
  const [contents] = await file.download();
  return contents.toString('utf8').trim().toLowerCase();
}

async function getPlaidClient() {
  const env = await getPlaidEnv();

  if (cachedClient && cachedEnv === env) {
    return cachedClient;
  }

  const secrets = JSON.parse(process.env.PLAID_SECRETS);
  const clientId = secrets.client_id;

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
    dev: PlaidEnvironments.development,
    production: PlaidEnvironments.production,
    prod: PlaidEnvironments.production,
  };

  const basePath = envMap[env];
  if (!basePath) {
    throw new Error(`No Plaid basePath found for environment: ${env}`);
  }

  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secretKey,
      },
    },
  });

  cachedClient = new PlaidApi(configuration);
  cachedEnv = env;
  return cachedClient;
}

module.exports = { getPlaidClient };
