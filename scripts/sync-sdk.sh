#!/usr/bin/env bash
# Regenerates the OpenAPI spec from the API's Zod schemas, copies it into the
# SDK package and regenerates the SDK's TypeScript types from it.
# Run from the repository root after changing an API route or schema.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/stellar-pay-api"
pnpm openapi:generate
cp openapi/openapi.json sdk/openapi.json
cd sdk
pnpm generate
echo "SDK regenerated from stellar-pay-api/openapi/openapi.json"
