const { getPlaidClient } = require('../lib/plaidClient');
const { CountryCode } = require('plaid');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logPlaidError, publicError } = require('../lib/bankingSecurity');

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
      return publicError(res, 400, 'Please choose a bank connection and try again.');
    }

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

    const allFreshAccounts = accountsResponse.data.accounts.map((acct) => ({
      account_id: acct.account_id,
      name: acct.name,
      official_name: acct.official_name || null,
      mask: acct.mask || '',
      type: acct.type,
      subtype: acct.subtype || null,
      available_balance: acct.balances.available ?? null,
      current_balance: acct.balances.current ?? null,
    }));

    // Fetch tombstones so accounts the user explicitly removed are never re-created.
    const tombstoneSnap = await db.collection('removed_accounts')
      .where('user_id', '==', uid)
      .get();
    const removedAccountIds = new Set();
    tombstoneSnap.forEach((d) => removedAccountIds.add(d.data().account_id));

    // Only upsert accounts that have not been tombstoned.
    const freshAccounts = allFreshAccounts.filter((a) => !removedAccountIds.has(a.account_id));
    const freshAccountIds = new Set(freshAccounts.map((a) => a.account_id));

    // Find existing accounts in Firestore for this item.
    const existingSnap = await db.collection('accounts')
      .where('user_id', '==', uid)
      .where('plaid_item_id', '==', itemId)
      .get();

    const staleAccountIds = [];
    existingSnap.forEach((d) => {
      const aid = d.data().account_id;
      // An account is stale if Plaid no longer returns it, OR if the user has
      // tombstoned it — in either case its Firestore doc should be removed.
      if (aid && !freshAccountIds.has(aid)) {
        staleAccountIds.push(aid);
      }
    });

    // Build batch: delete stale data, upsert fresh accounts.
    const batch = db.batch();

    // Record that this item was successfully used just now.
    batch.set(db.collection('plaid_items').doc(itemId), {
      last_used_at: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Delete stale account docs.
    existingSnap.forEach((d) => {
      if (staleAccountIds.includes(d.data().account_id)) {
        batch.delete(d.ref);
      }
    });

    // Delete transactions and forecasts for removed accounts.
    if (staleAccountIds.length > 0) {
      const [staleTxSnap, staleForecastSnap] = await Promise.all([
        db.collection('transactions').where('user_id', '==', uid).where('account_id', 'in', staleAccountIds).get(),
        db.collection('forecasts').where('user_id', '==', uid).where('account_id', 'in', staleAccountIds).get(),
      ]);
      staleTxSnap.forEach((d) => batch.delete(d.ref));
      staleForecastSnap.forEach((d) => batch.delete(d.ref));
    }

    // Upsert fresh (non-tombstoned) accounts.
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
    logPlaidError('refresh-accounts', error);
    return publicError(res, 502, 'We couldn’t refresh your bank accounts. Please try again.');
  }
}

module.exports = { handler };
