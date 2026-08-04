/// <reference types="vite/client" />

// Injected at build time via vite.config.ts's `define` — an ISO timestamp of
// when the production bundle was built, used to confirm deploy freshness.
declare const __BUILD_TIME__: string;
