const { getPlaidClient } = require('../lib/plaidClient');
const { CountryCode } = require('plaid');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logPlaidError, publicError } = require('../lib/bankingSecurity');

const MAX_BATCH_OPERATIONS = 450;
const MAX_IN_VALUES = 10;

function chunks(values, size) {
  const result = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
}

async function commitOperations(db, operations) {
  for (const operationChunk of chunks(operations, MAX_BATCH_OPERATIONS)) {
    if (operationChunk.length === 0) continue;
    const batch = db.batch();
    for (const operation of operationChunk) {
      if (operation.type === 'delete') {
        batch.delete(operation.ref);
      } else {
        batch.set(operation.ref, operation.data, operation.options);
      }
    }
    await batch.commit();
  }
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

    const staleAccountIds = [];
    existingSnap.forEach((d) => {
      const aid = d.data().account_id;
      // An account is stale if Plaid no longer returns it, OR if the user has
      // tombstoned it — in either case its Firestore doc should be removed.
      if (aid && !freshAccountIds.has(aid)) {
        staleAccountIds.push(aid);
      }
    });
    const uniqueStaleAccountIds = [...new Set(staleAccountIds)];

    // Gather all changes first, then commit in chunks below Firestore's 500
    // operation limit. The 450-operation limit leaves room for future fields
    // added to this reconciliation without risking a rejected commit.
    const operations = [{
      type: 'set',
      ref: db.collection('plaid_items').doc(itemId),
      data: { last_used_at: FieldValue.serverTimestamp() },
      options: { merge: true },
    }];

    existingSnap.forEach((d) => {
      if (uniqueStaleAccountIds.includes(d.data().account_id)) {
        operations.push({ type: 'delete', ref: d.ref });
      }
    });

    // Delete transactions and forecasts for removed accounts.
    if (uniqueStaleAccountIds.length > 0) {
      const accountIdChunks = chunks(uniqueStaleAccountIds, MAX_IN_VALUES);
      const [staleTxSnapshots, staleForecastSnapshots] = await Promise.all([
        Promise.all(accountIdChunks.map((accountIdChunk) => db.collection('transactions')
          .where('user_id', '==', uid)
          .where('account_id', 'in', accountIdChunk)
          .get())),
        Promise.all(accountIdChunks.map((accountIdChunk) => db.collection('forecasts')
          .where('user_id', '==', uid)
          .where('account_id', 'in', accountIdChunk)
          .get())),
      ]);
      staleTxSnapshots.forEach((snapshot) => snapshot.forEach((d) => {
        operations.push({ type: 'delete', ref: d.ref });
      }));
      staleForecastSnapshots.forEach((snapshot) => snapshot.forEach((d) => {
        operations.push({ type: 'delete', ref: d.ref });
      }));
    }

    // Upsert fresh (non-tombstoned) accounts.
    for (const acct of freshAccounts) {
      const docId = `${uid}_${itemId}_${acct.account_id}`;
      operations.push({
        type: 'set',
        ref: db.collection('accounts').doc(docId),
        data: {
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
        },
        options: { merge: true },
      });
    }

    await commitOperations(db, operations);

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
