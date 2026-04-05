const { getAuth } = require("firebase-admin/auth");

/**
 * Verifies the Firebase Auth ID token in the Authorization header.
 * Returns the decoded token (containing uid, email, etc.) on success,
 * or null if the token is missing or invalid.
 *
 * @param {import("firebase-functions/v2/https").Request} req
 * @returns {Promise<import("firebase-admin/auth").DecodedIdToken | null>}
 */
async function verifyAuth(req) {
  const authHeader = req.headers["authorization"] || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const idToken = authHeader.slice("Bearer ".length);
  if (!idToken) {
    return null;
  }

  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    return decoded;
  } catch (err) {
    console.error("[auth] verifyIdToken failed:", err.message);
    return null;
  }
}

module.exports = { verifyAuth };
