#!/bin/bash
set -e

echo "=== Verifying stellar-pay-core ==="
cd stellar-pay-core
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo build --target wasm32-unknown-unknown --release
cd ..

echo "=== Verifying stellar-pay-api ==="
cd stellar-pay-api
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run openapi:check
cd ..

echo "=== Verifying stellar-pay-api/sdk ==="
cd stellar-pay-api/sdk
pnpm install --frozen-lockfile
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
cd ../..

echo "=== All packages verified successfully ==="