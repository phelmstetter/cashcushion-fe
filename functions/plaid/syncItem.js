const { getFirestore } = require('firebase-admin/firestore');
const { PubSub } = require('@google-cloud/pubsub');

const SYNC_PUBSUB_TOPIC = 'plaid-sync-trigger';

let pubsubClient = null;

function getPubSubClient() {
  if (!pubsubClient) {
    pubsubClient = new PubSub();
  }
  return pubsubClient;
}

/**
 * Handler for POST /api/plaid/sync-item
 * Kicks off an async transaction sync for one linked bank by publishing
 * { item_id } to the plaid-sync-trigger Pub/Sub topic. The actual sync is
 * performed out-of-band by the plaidToFirestoreSync Cloud Function (in a
 * separate project) — this handler only confirms the trigger was sent.
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
      return res.status(404).json({ error: 'Item not found — try re-linking the bank' });
    }

    const itemData = itemDoc.data();
    if (itemData.user_id !== uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (itemData.deactivated_at) {
      return res.status(404).json({ error: 'Item not found — try re-linking the bank' });
    }

    try {
      const dataBuffer = Buffer.from(JSON.stringify({ item_id: itemId }));
      await getPubSubClient().topic(SYNC_PUBSUB_TOPIC).publishMessage({ data: dataBuffer });
    } catch (error) {
      console.error('Error publishing plaid-sync-trigger message:', error?.message || error);
      return res.status(500).json({ error: 'Failed to request sync — please try again' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error handling sync-item request:', error?.message || error);
    return res.status(500).json({ error: 'Failed to request sync' });
  }
}

module.exports = { handler };
