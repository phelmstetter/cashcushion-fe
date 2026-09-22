#!/bin/bash
set -euo pipefail

npm ci --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm --prefix functions ci --registry=https://registry.npmjs.org/ --no-audit --no-fund
npm run db:push
