const { getPlaidClient } = require('../lib/plaidClient');
const { CountryCode } = require('plaid');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logPlaidError, publicError } = require('../lib/bankingSecurity');

const MAX_BATCH_OPERATIONS = 400;
const MAX_IN_QUERY_VALUES = 10;

async function commitInBatches(db, operations) {
  for (let index = 0; index < operations.length; index += MAX_BATCH_OPERATIONS) {
    const batch = db.batch();
    for (const operation of operations.slice(index, index + MAX_BATCH_OPERATIONS)) {
      operation(batch);
    }
    await batch.commit();
  }
}

async function getRecordsForAccountIds(db, collectionName, uid, accountIds) {
  const records = [];
  for (let index = 0; index < accountIds.length; index += MAX_IN_QUERY_VALUES) {
    const ids = accountIds.slice(index, index + MAX_IN_QUERY_VALUES);
    const snapshot = await db.collection(collectionName)
      .where('user_id', '==', uid)
      .where('account_id', 'in', ids)
      .get();
    snapshot.forEach((record) => records.push(record));
  }
  return records;
}

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

    const staleAccountIds = new Set();
    existingSnap.forEach((d) => {
      const aid = d.data().account_id;
      // An account is stale if Plaid no longer returns it, OR if the user has
      // tombstoned it — in either case its Firestore doc should be removed.
      if (aid && !freshAccountIds.has(aid)) {
        staleAccountIds.add(aid);
      }
    });

    const staleAccountIdList = Array.from(staleAccountIds);
    const [staleTransactions, staleForecasts] = staleAccountIdList.length > 0
      ? await Promise.all([
          getRecordsForAccountIds(db, 'transactions', uid, staleAccountIdList),
          getRecordsForAccountIds(db, 'forecasts', uid, staleAccountIdList),
        ])
      : [[], []];

    const operations = [
      (batch) => batch.set(db.collection('plaid_items').doc(itemId), {
        last_used_at: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ];

    existingSnap.forEach((record) => {
      if (staleAccountIds.has(record.data().account_id)) {
        operations.push((batch) => batch.delete(record.ref));
      }
    });
    staleTransactions.forEach((record) => operations.push((batch) => batch.delete(record.ref)));
    staleForecasts.forEach((record) => operations.push((batch) => batch.delete(record.ref)));

    for (const acct of freshAccounts) {
      const docId = `${uid}_${itemId}_${acct.account_id}`;
      operations.push((batch) => batch.set(db.collection('accounts').doc(docId), {
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
      }, { merge: true }));
    }

    await commitInBatches(db, operations);

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
