const { getFirestore } = require('firebase-admin/firestore');
const { PubSub } = require('@google-cloud/pubsub');
const { publicError } = require('../lib/bankingSecurity');

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

    try {
      const dataBuffer = Buffer.from(JSON.stringify({ item_id: itemId }));
      await getPubSubClient().topic(SYNC_PUBSUB_TOPIC).publishMessage({ data: dataBuffer });
    } catch (error) {
      console.error('Error publishing plaid-sync-trigger message:', error?.message || error);
      return publicError(res, 502, 'We couldn’t request a bank sync. Please try again.');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error handling sync-item request:', error?.message || error);
    return publicError(res, 502, 'We couldn’t request a bank sync. Please try again.');
  }
}

module.exports = { handler };
