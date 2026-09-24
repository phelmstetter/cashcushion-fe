---
name: Firebase auth on Replit domains
description: Why Firebase redirect sign-in is unsafe on Replit development domains and which flow to prefer.
---

Use direct, user-triggered popup authentication on Replit development domains. Do not fall back to Firebase redirect authentication unless the Firebase auth helper has been configured on the same origin as the app.

**Why:** Safari and other browsers that block third-party storage cannot reliably restore Firebase redirect state when the app runs on a `replit.dev` origin and the auth helper runs on `firebaseapp.com`. This can return users to the login page repeatedly.

**How to apply:** Keep mobile and desktop development sign-in on the popup flow. If redirect sign-in becomes necessary, first implement one of Firebase's supported same-origin redirect configurations, such as proxying the auth helper or hosting the app and auth helper on the same custom domain.