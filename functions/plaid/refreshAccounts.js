const { getPlaidClient } = require('../lib/plaidClient');
const { CountryCode } = require('plaid');
const { getFirestore } = require('firebase-admin/firestore');

/**
 * Handler for POST /api/plaid/refresh-accounts
 * Fetches the current account list for an existing Plaid item, reconciles
 * Firestore (deletes stale accounts + their transactions/forecasts, upserts
 * fresh accounts), and returns the updated account list.
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

    const freshAccounts = accountsResponse.data.accounts.map((acct) => ({
      account_id: acct.account_id,
      name: acct.name,
      official_name: acct.official_name || null,
      mask: acct.mask || '',
      type: acct.type,
      subtype: acct.subtype || null,
      available_balance: acct.balances.available ?? null,
      current_balance: acct.balances.current ?? null,
    }));

    const freshAccountIds = new Set(freshAccounts.map((a) => a.account_id));

    // Find existing accounts in Firestore for this item.
    const existingSnap = await db.collection('accounts')
      .where('user_id', '==', uid)
      .where('plaid_item_id', '==', itemId)
      .get();

    const staleAccountIds = [];
    existingSnap.forEach((d) => {
      const aid = d.data().account_id;
      if (aid && !freshAccountIds.has(aid)) {
        staleAccountIds.push(aid);
      }
    });

    // Build batch: delete stale data, upsert fresh accounts.
    const batch = db.batch();

    // Delete stale account docs.
    existingSnap.forEach((d) => {
      if (staleAccountIds.includes(d.data().account_id)) {
        batch.delete(d.ref);
      }
    });

    // Delete transactions and forecasts for removed accounts.
    if (staleAccountIds.length > 0) {
      const [staleTxSnap, staleForecastSnap] = await Promise.all([
        db.collection('transactions').where('account_id', 'in', staleAccountIds).get(),
        db.collection('forecasts').where('account_id', 'in', staleAccountIds).get(),
      ]);
      staleTxSnap.forEach((d) => batch.delete(d.ref));
      staleForecastSnap.forEach((d) => batch.delete(d.ref));
    }

    // Upsert fresh accounts.
    for (const acct of freshAccounts) {
      const docId = `${uid}_${itemId}_${acct.account_id}`;
      batch.set(db.collection('accounts').doc(docId), {
        user_id: uid,
        account_id: acct.account_id,
        name: acct.name,
        official_name: acct.official_name,
        mask: acct.mask,
        type: acct.type,
        subtype: acct.subtype,
        available_balance: acct.available_balance,
        current_balance: acct.current_balance,
        plaid_item_id: itemId,
        plaid_institution_id: institutionId,
        plaid_institution_name: institutionName,
      }, { merge: true });
    }

    await batch.commit();

    return res.status(200).json({
      ok: true,
      item_id: itemId,
      institution_id: institutionId,
      institution_name: institutionName,
      accounts: freshAccounts,
    });
  } catch (error) {
    console.error('Error refreshing accounts:', error?.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to refresh accounts' });
  }
}

module.exports = { handler };
