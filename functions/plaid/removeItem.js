const { getPlaidClient } = require('../lib/plaidClient');
const { getFirestore } = require('firebase-admin/firestore');

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
    const { itemId } = req.body;
    if (!itemId) {
      return res.status(400).json({ error: 'itemId is required' });
    }

    const db = getFirestore();

    // Look up the access token for this item.
    const itemDoc = await db.collection('plaid_items').doc(itemId).get();

    if (itemDoc.exists) {
      const itemData = itemDoc.data();

      // Verify the item belongs to the requesting user.
      if (itemData.user_id !== uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Tell Plaid to remove the item.
      try {
        const client = await getPlaidClient();
        await client.itemRemove({ access_token: itemData.access_token });
      } catch (err) {
        console.warn('Plaid itemRemove failed (continuing with local cleanup):', err?.response?.data || err.message);
      }
    } else {
      console.warn(`plaid_items/${itemId} not found — skipping Plaid revocation and Firestore cleanup`);
    }

    // Delete all Firestore data associated with this item in parallel.
    const batch = db.batch();

    // Delete the plaid_items document.
    batch.delete(db.collection('plaid_items').doc(itemId));

    // Delete accounts linked to this item.
    const accountsSnap = await db.collection('accounts')
      .where('plaid_item_id', '==', itemId)
      .get();
    accountsSnap.forEach((doc) => batch.delete(doc.ref));

    // Delete transactions linked to this item.
    const txSnap = await db.collection('transactions')
      .where('item_id', '==', itemId)
      .get();
    txSnap.forEach((doc) => batch.delete(doc.ref));

    await batch.commit();

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error removing item:', error?.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to remove bank account' });
  }
}

module.exports = { handler };
