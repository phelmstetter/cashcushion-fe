import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "child_process";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// Best-effort git info for the /build diagnostics page — falls back to
// "unknown" when not run inside a git checkout (shouldn't normally happen
// in this repo's CI, but keeps the build from failing if it ever isn't).
function safeGit(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    // Build-time info so a deployed build's freshness can be confirmed on
    // the /build page instead of guessing whether a Cloud Build run
    // actually picked up the latest code.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __COMMIT_HASH__: JSON.stringify(safeGit("git rev-parse --short HEAD")),
    __COMMIT_MESSAGE__: JSON.stringify(safeGit("git log -1 --pretty=%s")),
  },
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
