# Manual reconciliation API configuration

The frontend sends manual forecast matching, replacement, and unmatching to the
backend's `manual-reconciliation-api` Cloud Function. Set
`VITE_MANUAL_RECONCILIATION_API_URL` to its **full deployed HTTPS function URL**.
This value is read by `client/src/lib/manualReconciliation.ts` and baked into
the Vite bundle at build time. It is not a secret, but do not hard-code a
guessed URL. Without it, manual reconciliation shows a configuration error and
does not fall back to Firestore writes.

For local development, supply the variable in the frontend build environment
(or in an uncommitted `client/.env.local`, the Vite root). Restart the dev
server after changing it. For the Cloud Build frontend, supply the
`_VITE_MANUAL_RECONCILIATION_API_URL` substitution; `cloudbuild.yaml` passes it
to the Vite build step. Set it before deploying the frontend.

The backend must include the exact browser origin in its
`MANUAL_RECONCILIATION_ALLOWED_ORIGINS` allowlist. Replit preview uses the
project's HTTPS `.replit.dev` origin, not `localhost:5000` in the browser.
Add the exact development and deployed frontend origins separately. Do not
work around CORS with a proxy or direct Firestore reconciliation writes.

Requests use the current Firebase user's ID token in
`Authorization: Bearer <token>`. The backend derives the acting user from that
token; no `user_id` is sent by the reconciliation client.

Firestore rules still permit normal owner edits, but prevent moving a matched
forecast to a different account or deleting it while it is matched. Those
actions would otherwise leave the server-owned transaction claim inconsistent.
Unmatch the forecast through the API before changing its account or deleting
it. If a series contains matched forecasts, it must be unmatched before the
series can be deleted by the client.