const { getPlaidClient } = require('../lib/plaidClient');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logPlaidError, publicError } = require('../lib/bankingSecurity');

/**
 * Handler for POST /api/plaid/remove-item
 * Removes a Plaid item and deletes all associated data from Firestore.
 *
 * @param {string} uid - Verified Firebase Auth user ID from the gateway
 * @param {import("firebase-functions/v2/https").Request} req
 * @param {import("firebase-functions/v2/https").Response} res
 */
async function handler(uid, req, res) {
  try {
    const { itemId, accountIds: requestedAccountIds } = req.body;
    if ((!itemId || typeof itemId !== 'string') && (!Array.isArray(requestedAccountIds) || requestedAccountIds.length === 0)) {
      return publicError(res, 400, 'Please choose a bank connection and try again.');
    }
    if (Array.isArray(requestedAccountIds) && (requestedAccountIds.length > 10 || requestedAccountIds.some((id) => typeof id !== 'string' || !id))) {
      return publicError(res, 400, 'Please choose a bank connection and try again.');
    }

    const db = getFirestore();
    let itemDoc = null;

    // Look up the access token for this item.
    if (itemId) itemDoc = await db.collection('plaid_items').doc(itemId).get();

    if (itemDoc?.exists) {
      const itemData = itemDoc.data();

      // Verify the item belongs to the requesting user.
      if (itemData.user_id !== uid) {
        return publicError(res, 403, 'You do not have access to this bank connection.');
      }

      // Tell Plaid to remove the item.
      try {
        const client = await getPlaidClient();
        await client.itemRemove({ access_token: itemData.access_token });
      } catch (err) {
        // A remote revocation failure is logged for follow-up, but local data
        // is still removed so it is no longer available in this application.
        logPlaidError('remove-item', err);
      }
    }

    // Locate only records owned by the signed-in user. For a legacy account
    // group without a plaid_items document, accountIds provide the narrow,
    // user-owned set that must be removed.
    let accountsSnap;
    if (itemId) {
      accountsSnap = await db.collection('accounts')
        .where('user_id', '==', uid)
        .where('plaid_item_id', '==', itemId)
        .get();
    } else {
      accountsSnap = await db.collection('accounts')
        .where('user_id', '==', uid)
        .where('account_id', 'in', requestedAccountIds)
        .get();
    }
    if (!itemDoc?.exists && accountsSnap.empty) {
      return publicError(res, 404, 'This bank connection is no longer available. Please link it again.');
    }

    // Create immutable server-owned tombstones before deleting accounts. This
    // prevents a later sync or re-link from silently recreating a removed one.
    const batch = db.batch();
    if (itemDoc?.exists) {
      batch.set(db.collection('plaid_items').doc(itemId), {
        deactivated_at: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const accountIds = [];
    accountsSnap.forEach((doc) => {
      batch.delete(doc.ref);
      const aid = doc.data().account_id;
      if (aid) {
        accountIds.push(aid);
        batch.set(db.collection('removed_accounts').doc(`${uid}_${aid}`), {
          user_id: uid,
          account_id: aid,
          removed_at: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    });

    // Keep all cleanup scoped to the signed-in user's records.
    const cleanupQueries = itemId
      ? [db.collection('transactions').where('user_id', '==', uid).where('item_id', '==', itemId).get()]
      : [];
    if (accountIds.length > 0) {
      cleanupQueries.push(
        db.collection('forecasts').where('user_id', '==', uid).where('account_id', 'in', accountIds).get()
      );
    }
    const snapshots = await Promise.all(cleanupQueries);
    snapshots.forEach((snap) => snap.forEach((doc) => batch.delete(doc.ref)));

    await batch.commit();

    return res.status(200).json({ ok: true });
  } catch (error) {
    logPlaidError('remove-item', error);
    return publicError(res, 502, 'We couldn’t remove this bank connection. Please try again.');
  }
}

module.exports = { handler };
