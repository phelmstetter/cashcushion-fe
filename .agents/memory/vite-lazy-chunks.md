---
name: Deferred Vite dependencies
description: Vite modulepreload behavior to check when splitting large client libraries
---

When a large library is loaded through a dynamic import, avoid forcing it into a named manual chunk unless the generated HTML is checked for unwanted modulepreload links. Letting the lazy entry own the dependency keeps the library out of the initial preload set.

**Why:** An explicit manual chunk for a charting library remained in the initial HTML preload list even after the chart component moved behind `React.lazy`, so the browser still fetched the large payload before it was needed.

**How to apply:** After changing client code splitting, inspect `dist/public/index.html` and the built entry imports, not only the chunk-size report. Confirm that deferred dependencies are absent from initial modulepreloads.