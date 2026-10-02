# CashCushion Architecture

> **Canonical architecture handoff.** This document describes the repository's current architecture, the intended target architecture, deployment ownership, trust boundaries, and migration work.
>
> **Maintenance rule:** Update this document whenever a change alters service boundaries, repository structure, deployment ownership, hosting, authentication/App Check, IAM, data flow, or external integrations. **Current State** must describe repository/deployed reality as verified by code/configuration. **Target State** describes intended architecture. Do not silently rewrite target architecture to match temporary implementation details.
>
> Last repository review: 2026-10-02.

## 1. Architecture principles

CashCushion is moving toward a Firebase-native web application with a single browser-facing API gateway and private backend services.

1. Firebase Hosting is the sole production frontend host.
2. The browser may access Firestore directly only where Firestore Security Rules fully enforce authorization and data ownership.
3. Privileged browser operations go through the Gen2 `gateway` function.
4. The gateway enforces Firebase App Check and Firebase Auth before routing privileged operations.
5. The browser must not call internal Python/Cloud Run services directly.
6. Gateway-to-service traffic should use IAM/service identity rather than browser CORS as the security boundary.
7. Plaid secrets, token exchange, synchronization, webhooks, reconciliation, and other privileged logic remain server-side.
8. Each deployable component has exactly one authoritative deployment path.
9. Backend-owned lifecycle/reconciliation fields are not browser-writable.
10. Prefer the simplest Firebase-native implementation; use separate Cloud Run services only when workload/runtime boundaries justify them.

## 2. Target system map

```text
                              Internet
                                 |
                                 v
                       +--------------------+
                       | Firebase Hosting   |
                       | React + Vite SPA   |
                       +---------+----------+
                                 |
                    +------------+-------------+
                    |                          |
             Firestore SDK                 /api/**
                    |                          |
                    v                          v
              +-----------+          +--------------------+
              | Firestore |          | gateway            |
              |           |          | Gen2 Function      |
              +-----+-----+          | App Check + Auth   |
                    ^                +---------+----------+
                    |                          |
                    |                 trusted server calls
                    |                          |
                    |          +---------------+---------------+
                    |          |               |               |
                    |          v               v               v
                    |   +-------------+   +----------+   +-----------+
                    |   | Reconcile   |   | Plaid    |   | Backend   |
                    |   | service     |   | services |   | jobs      |
                    |   +------+------+   +----+-----+   +-----+-----+
                    |          |               |               |
                    +----------+---------------+---------------+
                                           |
                                           v
                                       Firestore

Plaid webhooks/API traffic enters trusted backend infrastructure, not the SPA.
```

### Trust boundary

```text
UNTRUSTED
  Browser
    |
    | Firebase Auth / App Check / Firestore Rules
    v
------------------------- TRUST BOUNDARY -------------------------
  gateway
  backend workers
  reconciliation service
  Plaid integration
  Firebase Admin SDK
    |
    v
TRUSTED DATA / INFRASTRUCTURE
  Firestore and Google Cloud resources
```

App Check primarily protects the browser-to-gateway boundary. IAM/service identities should protect gateway-to-private-service communication where separate Cloud Run services are used.

## 3. Current repository state

The active web/monorepo is currently named `phelmstetter/cashcushion-fe`. Despite the legacy `-fe` name, it now contains the frontend, Firebase configuration, gateway function, tests, and deployment configuration.

Relevant top-level structure verified from `main`:

```text
cashcushion-fe/
├── .firebaserc
├── cloudbuild.yaml
├── firebase.json
├── firestore.rules
├── Dockerfile                 # legacy/duplicate web hosting path
├── nginx.conf                 # legacy/duplicate web hosting path
├── package.json
├── vite.config.ts
├── client/
│   └── src/
├── functions/
│   ├── cloudbuild.yaml
│   ├── index.js               # exports Gen2 gateway
│   ├── middleware/
│   ├── lib/
│   ├── plaid/
│   ├── test/
│   └── package.json
├── docs/
│   ├── manual-reconciliation.md
│   └── style-guide.md
├── scripts/
└── tests/
```

This is a map of architecture-significant paths, not an exhaustive file tree.

### Current frontend

The React/Vite frontend builds to `dist/public`.

`firebase.json` configures Firebase Hosting with:

- `dist/public` as the public directory.
- `/api/**` rewritten to the `gateway` function.
- all other paths rewritten to `/index.html` for the SPA.

The root `cloudbuild.yaml` currently builds the Vite frontend and deploys Firebase Hosting plus Firestore Rules.

### Current duplicate frontend deployment

The root `cloudbuild.yaml` also currently:

1. builds a Docker image from the frontend,
2. pushes it to Artifact Registry, and
3. deploys it as the `cashcushion-web` Cloud Run service.

That is a duplicate frontend hosting path and is **not part of the target architecture**. Firebase Hosting should become the only frontend host. The Docker/Cloud Run frontend path, including architecture-only dependencies such as the root `Dockerfile` and `nginx.conf`, should be removed once no longer required by another verified workflow.

### Current gateway

`functions/index.js` exports a Gen2 HTTPS function named `gateway`.

It currently routes Plaid operations including:

```text
POST /api/plaid/create-link-token
POST /api/plaid/exchange-token
POST /api/plaid/remove-item
POST /api/plaid/create-update-link-token
POST /api/plaid/refresh-accounts
POST /api/plaid/sync-item
```

The function definition uses `enforceAppCheck: true`. The gateway separately verifies the Firebase ID token and derives the user identity from the verified token rather than trusting a client-supplied UID.

`functions/cloudbuild.yaml` currently owns gateway deployment using `gcloud functions deploy gateway --gen2`.

The function is HTTP reachable (`--allow-unauthenticated`) because Firebase/App Check/Auth operate at the application boundary. That does **not** mean downstream internal services should also be browser-facing.

### Current manual reconciliation path

Manual reconciliation is still in a transition state.

`docs/manual-reconciliation.md` currently describes the browser calling a separately deployed `manual-reconciliation-api` using `VITE_MANUAL_RECONCILIATION_API_URL`, Firebase ID-token authentication, and a browser-origin CORS allowlist.

The root frontend build still defines and injects `_VITE_MANUAL_RECONCILIATION_API_URL`.

This direct browser-to-reconciliation-service architecture is **legacy/transitional and should not be treated as the target**.

Target flow:

```text
Browser
   |
   | /api/reconciliation/...
   v
Firebase Hosting rewrite
   |
   v
gateway
   |
   | authenticated trusted call
   v
private reconciliation backend
```

The reconciliation service may remain Python/Cloud Run if that runtime/service boundary is useful. The change is the exposure model: it should sit behind the gateway rather than serving as a browser API.

### Current Firestore boundary

Firestore remains both application storage and, where appropriate, a direct frontend data API.

Conceptually important data includes users, accounts/banking state, transactions, forecasts, and reconciliation/matching state.

Browser writes are governed by `firestore.rules`. Server-side components use trusted Admin/server access. Backend-managed reconciliation/lifecycle fields must remain protected from browser mutation.

### Current Plaid boundary

Plaid privileged operations are server-side. The browser can initiate user-facing Plaid Link flows, but secrets, token exchange, refresh/sync operations, webhook handling, and durable transaction ingestion belong in trusted backend infrastructure.

The gateway already contains Plaid routes. Future Plaid changes should preserve the gateway as the browser-facing boundary rather than introducing additional direct browser endpoints.

## 4. Current deployment ownership

| Component | Current owner/path | Target owner/path | Action |
|---|---|---|---|
| React/Vite SPA | root `cloudbuild.yaml` | root production pipeline -> Firebase Hosting | Keep |
| Firebase Hosting | root `cloudbuild.yaml` | sole frontend host | Keep |
| Firestore Rules | root `cloudbuild.yaml` | root production pipeline | Keep |
| `cashcushion-web` Cloud Run frontend | root `cloudbuild.yaml` | none | Remove |
| Gen2 `gateway` | `functions/cloudbuild.yaml` | one authoritative function deployment path | Keep/consolidate |
| Plaid browser API | `functions/index.js` gateway | gateway | Keep |
| Manual reconciliation browser API | direct backend URL | gateway route -> private service | Migrate |
| Firestore direct client access | Firebase SDK + rules | Firebase SDK + rules where safe | Keep |
| Internal services | mixed/transitional | private service boundary | Standardize |

## 5. Target repository structure

Do not perform directory churn solely to make the repository look like this. Move code when it clarifies real deployment/service ownership.

```text
cashcushion/
├── ARCHITECTURE.md            # canonical architecture handoff
├── README.md                  # project entry point; links here
├── cloudbuild.yaml            # authoritative production orchestration
├── firebase.json
├── firestore.rules
├── firestore.indexes.json     # when/if managed from repo
│
├── client/
│   ├── src/
│   └── ...
│
├── functions/
│   ├── index.js               # or src/ as function code grows
│   ├── middleware/
│   ├── plaid/
│   ├── lib/
│   ├── test/
│   └── package.json
│
├── services/
│   └── reconciliation/
│       ├── src/
│       ├── tests/
│       └── Dockerfile
│
├── docs/
├── scripts/
└── tests/
    └── integration/
```

The future repository may eventually be renamed from `cashcushion-fe` to `cashcushion`, but repository renaming is not required for the architecture to function. Avoid breaking deployment triggers merely for naming consistency.

## 6. Target request flows

### Normal client data access

```text
Browser -> Firebase Auth
Browser -> Firestore SDK -> Firestore Rules -> Firestore
```

Use this only where Security Rules can fully express the authorization and integrity requirements.

### Privileged browser operation

```text
Browser
  -> Firebase Hosting /api/**
  -> gateway
     -> App Check
     -> Firebase Auth
     -> request validation/rate limiting
     -> handler or private backend service
     -> Firestore / external API
```

### Manual reconciliation

```text
Browser
  -> /api/reconciliation/match|unmatch|replace
  -> gateway
  -> reconciliation service
  -> Firestore transaction
```

The browser should not need a reconciliation service URL or reconciliation-specific CORS allowlist in production.

### Plaid synchronization

```text
Browser -> gateway -> Plaid API
Plaid webhook -> trusted backend webhook handler -> sync/normalize -> Firestore
Firestore -> frontend via Firebase SDK
```

Never expose Plaid secrets or access tokens to the client bundle.

## 7. Migration plan

### Phase 1 — frontend hosting cleanup

- Remove the Docker build/push and `cashcushion-web` Cloud Run deploy steps from the root `cloudbuild.yaml`.
- Confirm Firebase Hosting is the authoritative production frontend.
- Remove the root `Dockerfile` and `nginx.conf` only after verifying they are not used by another active workflow.
- Verify production domain/Hosting traffic after deployment.

### Phase 2 — gateway deployment ownership

- Maintain exactly one authoritative deployment path for `gateway`.
- Ensure Firebase Hosting's `/api/**` rewrite and the deployed function use the same project/region/function identity.
- Avoid adding gateway deployment to multiple Cloud Build configurations.

### Phase 3 — reconciliation behind gateway

- Add reconciliation routes to the gateway.
- Remove the browser's dependency on `VITE_MANUAL_RECONCILIATION_API_URL`.
- Have the gateway invoke the reconciliation backend through a trusted/private service boundary.
- Remove browser CORS configuration from the reconciliation service once no browser traffic depends on it.
- Preserve existing reconciliation transaction semantics, ownership checks, idempotency, claims, and rollback behavior.

### Phase 4 — backend standardization

- Inventory remaining legacy backend repositories/services and determine `keep`, `move`, `replace`, or `retire`.
- Consolidate service source into this monorepo where it improves ownership and deployment clarity.
- Keep independent services only where they provide a real runtime, scaling, isolation, or operational benefit.
- Document webhook entry points, scheduled jobs, Pub/Sub/Eventarc flows, and service IAM once verified.

## 8. Security invariants

Future agents must preserve these unless an explicit architecture decision changes them:

- Never trust a client-supplied user ID for authorization.
- Verify Firebase Auth for privileged user operations.
- Enforce App Check on the browser-facing gateway where applicable.
- Do not weaken Firestore Rules to work around backend integration problems.
- Do not expose a private backend publicly merely to solve browser CORS.
- Do not place Plaid secrets/access tokens in Vite environment variables or browser code.
- Use server-side identity/IAM for service-to-service calls.
- Keep reconciliation claims and related writes atomic.
- Preserve idempotency for retryable financial operations.
- Do not deploy architecture/security changes based on guessed URLs, service names, domains, IAM bindings, or trigger configuration.

## 9. Known transition/verification items

Repository configuration alone does not prove live Google Cloud/Firebase state. Before declaring the migration complete, verify:

- Cloud Build trigger-to-config mapping.
- Production Firebase Hosting site/domain.
- `gateway` deployed project, region, runtime, and App Check behavior.
- Firebase Hosting `/api/**` rewrite behavior in production.
- IAM between gateway and any private Cloud Run backend.
- Whether `cashcushion-web` still receives production traffic before deletion.
- Manual reconciliation service deployment and callers.
- Plaid webhook URL and live webhook routing.
- Any scheduled jobs, Pub/Sub/Eventarc triggers, BigQuery integrations, or backend services not represented by this repo.
- Artifact Registry images/services that can be retired after cutover.

## 10. Agent operating guidance

When modifying CashCushion architecture:

1. Read this file first.
2. Inspect current code/configuration before assuming the `Current State` section is still accurate.
3. Treat `Target State` and the architecture principles as the intended direction.
4. If implementation reality has changed, update this document in the same change.
5. Distinguish repository evidence from live-cloud evidence.
6. Do not deploy, delete live infrastructure, change IAM, or change production security boundaries unless the task explicitly authorizes it.
7. Prefer small reversible migrations with verification between steps.
8. Do not reintroduce a duplicate frontend host or direct browser-to-internal-service architecture.

## 11. Immediate desired end state

The next architecture milestone is:

```text
Browser
   |
   v
Firebase Hosting  <---- only frontend host
   |        |
   |        +---- Firestore SDK -> Rules -> Firestore
   |
   +---- /api/**
           |
           v
        gateway
       /   |    \
      /    |     \
   Plaid  reconcile  other privileged operations
            |
            v
       private backend
```

At that point:

- `cashcushion-web` Cloud Run frontend is retired.
- Firebase Hosting is authoritative for the SPA.
- `gateway` has one deployment owner.
- privileged browser operations enter through `gateway`.
- reconciliation is no longer a direct browser/CORS API.
- backend services are protected by server-side trust boundaries.
