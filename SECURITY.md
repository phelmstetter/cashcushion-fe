# Banking security configuration

## Firebase App Check

The web client enables App Check debug mode only when both of these conditions are true:

1. it is running a local development build; and
2. `VITE_APP_CHECK_DEBUG_TOKEN` is supplied outside source control.

For local work, create a non-committed `.env.local` file containing a newly generated
debug token:

```bash
VITE_APP_CHECK_DEBUG_TOKEN=your-new-local-debug-token
```

Register that token only for the development web app in Firebase Console under
**App Check → Apps → [your web app] → Manage debug tokens**. Never put this value in
`.env.production`, Cloud Build substitutions, or a checked-in file.

To revoke the credential that was previously committed, open **Firebase Console →
App Check → Apps → [Cash Cushion web app] → Manage debug tokens**, locate the old
token, select its overflow menu, and choose **Delete/Revoke debug token**. Then
deploy a fresh production build.

## Plaid OAuth redirects

Bank OAuth redirects are disabled unless they exactly match a configured HTTPS entry.
Set `PLAID_ALLOWED_REDIRECT_URIS` on the Cloud Functions deployment to a
comma-separated allowlist of full callback URLs, and register the same URLs in
**Plaid Dashboard → Developers → API → Allowed redirect URIs**. Use
`functions/.env.example` as the format reference; do not commit real environment
files.

## Firebase Realtime Database dependency advisory

The Firebase SDK currently includes an optional Realtime Database compatibility
dependency that brings in `websocket-driver`. This application does not initialize
or import Firebase Realtime Database: the browser uses Firebase Auth, Firestore,
and App Check, while the server and Cloud Function use Admin Auth, Firestore, and
Storage only. There is no WebSocket endpoint or Realtime Database client exposed
by the application.

The dependency remains in the SDK's installed graph until Firebase removes or
updates it upstream. Keep Firebase packages at their current supported releases,
and re-run `npm audit --omit=dev` for both the root app and `functions` before
each release. Any future Realtime Database import or WebSocket feature requires a
fresh exposure review before release.