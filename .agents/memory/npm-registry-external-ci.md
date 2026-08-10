---
name: Replit npm registry breaks external CI lockfiles
description: Why npm install in this workspace can silently break Cloud Build/other external CI, and how to avoid/fix it.
---

Replit's environment points npm's default registry at an internal-only package firewall proxy
(a `package-firewall.replit.local` host, only reachable from inside a Replit container). Running
`npm install` normally here writes that proxy's URLs into `package-lock.json`'s `resolved` fields
for any newly-added/updated packages.

**Why it matters:** External CI systems (e.g. Google Cloud Build, GitHub Actions) run `npm ci`
against the committed lockfile and fetch packages from the exact `resolved` URL recorded there.
Since the internal proxy hostname doesn't resolve outside Replit's network, those builds fail with
`ENOTFOUND` — even though the app runs fine in the Replit workspace itself. This broke a project's
Cloud Build pipeline after a routine `npm install <pkg>` for an unrelated feature; only the newly
added package's subtree had bad URLs, the rest of the lockfile was fine.

**How to apply:** When installing/updating npm packages in a repo that deploys via external CI
(Cloud Build, GitHub Actions, etc.), install with the public registry explicitly:
`npm install --registry=https://registry.npmjs.org/ <pkg>`. If a lockfile already has bad entries,
regenerate it fully: delete `package-lock.json`, then run
`npm install --registry=https://registry.npmjs.org/` (direct internet access to `registry.npmjs.org`
works fine from inside Replit — the proxy is a default, not a network restriction). Verify with
`grep -c "package-firewall.replit.local" package-lock.json` before committing.
