/// <reference types="vite/client" />

// Injected at build time via vite.config.ts's `define` — lets the /build
// page show when and from which commit the running bundle was built, so a
// deploy's freshness can be confirmed visually instead of guessed.
declare const __BUILD_TIME__: string;
declare const __COMMIT_HASH__: string;
declare const __COMMIT_MESSAGE__: string;
