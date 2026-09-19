const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const MAX_REQUEST_BYTES = 16 * 1024;
const OPERATION_POLICIES = {
  "create-link-token": { maxRequests: 3, windowMs: 10 * 60 * 1000, cooldownMs: 30 * 1000 },
  "create-update-link-token": { maxRequests: 3, windowMs: 10 * 60 * 1000, cooldownMs: 30 * 1000 },
  "exchange-token": { maxRequests: 5, windowMs: 10 * 60 * 1000, cooldownMs: 5 * 1000 },
  "refresh-accounts": { maxRequests: 3, windowMs: 5 * 60 * 1000, cooldownMs: 30 * 1000 },
  "sync-item": { maxRequests: 3, windowMs: 5 * 60 * 1000, cooldownMs: 60 * 1000 },
  "remove-item": { maxRequests: 3, windowMs: 10 * 60 * 1000, cooldownMs: 30 * 1000 },
};
// Slightly longer than the function timeout. If an invocation is forcibly
// stopped before it can release its lease, the next request remains protected
// until the platform has definitely stopped the original operation.
const MAX_OPERATION_MS = 35 * 1000;

function publicError(res, status, error, retryAfterSeconds) {
  const body = { error };
  if (retryAfterSeconds) body.retry_after_seconds = retryAfterSeconds;
  return res.status(status).json(body);
}

function validateRequest(req, res) {
  const contentLength = Number(req.headers["content-length"] || 0);
  if (!Number.isFinite(contentLength) || contentLength > MAX_REQUEST_BYTES || req.rawBody?.length > MAX_REQUEST_BYTES) {
    publicError(res, 413, "This request is too large. Please try again.");
    return false;
  }

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    publicError(res, 400, "Please check your request and try again.");
    return false;
  }

  return true;
}

function allowedRedirectUris() {
  return new Set(
    (process.env.PLAID_ALLOWED_REDIRECT_URIS || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      }),
  );
}

function getApprovedRedirectUri(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return null;

  let uri;
  try {
    uri = new URL(value);
  } catch {
    return null;
  }

  if (uri.protocol !== "https:" || uri.username || uri.password) return null;
  return allowedRedirectUris().has(uri.toString()) ? uri.toString() : null;
}

function hasValidRedirectUri(value) {
  return value === undefined || value === null || value === "" || getApprovedRedirectUri(value) !== null;
}

function logPlaidError(operation, error) {
  const plaidError = error?.response?.data;
  console.error(`[plaid:${operation}] request failed`, {
    errorCode: plaidError?.error_code,
    errorType: plaidError?.error_type,
    requestId: plaidError?.request_id,
    message: plaidError?.error_message || error?.message,
  });
}

async function acquireOperation(uid, operation) {
  const policy = OPERATION_POLICIES[operation];
  if (!policy) throw new Error(`Missing banking operation policy: ${operation}`);

  const db = getFirestore();
  const ref = db.collection("_banking_request_limits").doc(`${uid}_${operation}`);
  const now = Date.now();
  const leaseId = `${now}-${Math.random().toString(36).slice(2)}`;
  let result;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? snapshot.data() : {};
    const activeUntil = current.active_until?.toMillis?.() || 0;
    const lastStartedAt = current.last_started_at?.toMillis?.() || 0;
    const windowStartedAt = current.window_started_at?.toMillis?.() || 0;
    const inWindow = windowStartedAt && now - windowStartedAt < policy.windowMs;
    const requestCount = inWindow ? (current.request_count || 0) : 0;

    if (activeUntil > now) {
      result = { allowed: false, status: 409, retryAfterSeconds: Math.ceil((activeUntil - now) / 1000) };
      return;
    }
    if (lastStartedAt && now - lastStartedAt < policy.cooldownMs) {
      result = { allowed: false, status: 429, retryAfterSeconds: Math.ceil((policy.cooldownMs - (now - lastStartedAt)) / 1000) };
      return;
    }
    if (requestCount >= policy.maxRequests) {
      result = { allowed: false, status: 429, retryAfterSeconds: Math.ceil((policy.windowMs - (now - windowStartedAt)) / 1000) };
      return;
    }

    transaction.set(ref, {
      window_started_at: inWindow ? current.window_started_at : new Date(now),
      request_count: requestCount + 1,
      last_started_at: new Date(now),
      active_until: new Date(now + MAX_OPERATION_MS),
      active_lease_id: leaseId,
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });
    result = { allowed: true, leaseId };
  });

  return result;
}

async function releaseOperation(uid, operation, leaseId) {
  if (!leaseId) return;
  const ref = getFirestore().collection("_banking_request_limits").doc(`${uid}_${operation}`);
  await getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists && snapshot.data().active_lease_id === leaseId) {
      transaction.update(ref, {
        active_until: new Date(0),
        active_lease_id: FieldValue.delete(),
        updated_at: FieldValue.serverTimestamp(),
      });
    }
  });
}

async function renewOperation(uid, operation, leaseId) {
  if (!leaseId) return;
  const db = getFirestore();
  const ref = db.collection("_banking_request_limits").doc(`${uid}_${operation}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists && snapshot.data().active_lease_id === leaseId) {
      transaction.update(ref, {
        active_until: new Date(Date.now() + MAX_OPERATION_MS),
        updated_at: FieldValue.serverTimestamp(),
      });
    }
  });
}

module.exports = {
  acquireOperation,
  getApprovedRedirectUri,
  hasValidRedirectUri,
  logPlaidError,
  publicError,
  releaseOperation,
  renewOperation,
  validateRequest,
};