const { getPlaidClient } = require('../lib/plaidClient');
const { CountryCode } = require('plaid');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logPlaidError, publicError } = require('../lib/bankingSecurity');

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
      return publicError(res, 400, 'The bank connection could not be completed. Please try again.');
    }

    const client = await getPlaidClient();

    const exchangeResponse = await client.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Save to plaid_items so the transaction sync worker can find the access token.
    // deactivated_at is explicitly cleared so re-linking a previously removed
    // item (same item_id) reactivates it instead of leaving it marked inactive.
    const db = getFirestore();
    const existingItem = await db.collection('plaid_items').doc(itemId).get();
    if (existingItem.exists && existingItem.data().user_id !== uid) {
      console.warn('[plaid:exchange-token] rejected item already owned by another user', { itemId });
      return publicError(res, 403, 'You do not have access to this bank connection.');
    }
    await db.collection('plaid_items').doc(itemId).set({
      access_token: accessToken,
      item_id: itemId,
      user_id: uid,
      next_cursor: null,
      last_used_at: FieldValue.serverTimestamp(),
      deactivated_at: null,
    }, { merge: true });

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

    // Bank-managed account records are written only with the Admin SDK. Browser
    // clients can read their account records but cannot forge balances, metadata,
    // ownership, or Plaid IDs.
    const tombstoneSnap = await db.collection('removed_accounts').where('user_id', '==', uid).get();
    const removedAccountIds = new Set();
    tombstoneSnap.forEach((doc) => removedAccountIds.add(doc.data().account_id));
    const activeAccounts = accounts.filter((account) => !removedAccountIds.has(account.account_id));
    const batch = db.batch();
    for (const account of activeAccounts) {
      batch.set(db.collection('accounts').doc(`${uid}_${itemId}_${account.account_id}`), {
        ...account,
        user_id: uid,
        plaid_item_id: itemId,
        plaid_institution_id: institutionId,
        plaid_institution_name: institutionName,
      }, { merge: true });
    }
    await batch.commit();

    return res.status(200).json({ ok: true, item_id: itemId });
  } catch (error) {
    logPlaidError('exchange-token', error);
    return publicError(res, 502, 'We couldn’t save your bank connection. Please try again.');
  }
}

module.exports = { handler };
