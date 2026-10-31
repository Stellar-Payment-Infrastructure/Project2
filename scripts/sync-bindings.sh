#!/usr/bin/env bash
# Copies contract artifacts the API consumes into stellar-pay-api/src/generated/.
#
#   scripts/sync-bindings.sh                 # copy event test vectors (always)
#   CONTRACT_ID=C... scripts/sync-bindings.sh  # also generate TS bindings (needs the Stellar CLI)
#
# Run from the repository root after changing the contract.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/stellar-pay-api/src/generated"
mkdir -p "$OUT"

cp "$ROOT/stellar-pay-core/docs/test-vectors.json" "$OUT/contract-test-vectors.json"
echo "copied event test vectors -> stellar-pay-api/src/generated/contract-test-vectors.json"

if [[ -n "${CONTRACT_ID:-}" ]]; then
  if ! command -v stellar >/dev/null 2>&1; then
    echo "stellar CLI not found; skipping bindings generation" >&2
    exit 1
  fi
  stellar contract bindings typescript \
    --network testnet \
    --contract-id "$CONTRACT_ID" \
    --output-dir "$OUT/bindings" \
    --overwrite
  echo "generated TypeScript bindings -> stellar-pay-api/src/generated/bindings"
fi
