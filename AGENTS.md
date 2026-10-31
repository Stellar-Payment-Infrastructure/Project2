# AGENTS.md — Stellar Payment Infrastructure (Root)

This is the root AGENTS.md for the monorepo. Each package has its own AGENTS.md.

## Monorepo Rules

1. **Split-ready always.** Every folder must build, test and lint on its own. No imports by relative path across folders (`../stellar-pay-api/...` is forbidden). Cross-package use goes through a declared semver dependency or generated artifacts (contract bindings, OpenAPI-generated SDK) committed inside the consuming package.

2. **One package per commit.** Conventional Commits with the package as scope: `feat(core): add settle`, `fix(api): retry webhook on 5xx`, `feat(frontend): add QRCodeDisplay`. A commit touching two folders must be split.

3. **Never touch secrets.** No secret keys, seed phrases, API keys, or webhook secrets in files, logs, commits, or prompts. Use `stellar keys` identities and gitignored `.env` files. Testnet only. Never target mainnet.

4. **Money is never a float.** Amounts are integer base units. In Rust use `i128` with checked math. In TypeScript use `bigint` internally and **decimal strings** in JSON/OpenAPI. Format for display only in UI code, using the token's decimals.

5. **Verify before claiming done.** Run the package verify command and report the result. Never say "should work".

6. **Do not invent APIs.** For `soroban-sdk`, `@stellar/stellar-sdk`, the Stellar CLI, wallets kit, Express, Drizzle, Zod, OpenAPI tooling and OpenCode, check the current official docs or the installed package source before using an API.

7. **Non-custodial boundaries.** Contract funds may only ever move to the merchant, the fee recipient, or back to the payer. Browser code never holds a merchant secret key or API key. The API never relays arbitrary signed transactions.

8. **No PII on-chain.** Only ids, hashes, amounts, addresses, status. Order details and customer data live off-chain in the API database.

9. **Honest docs.** READMEs describe only what is implemented and tested.

10. **Leave the Wave issues open.** `PLAYBOOK.md` §12 defines an MVP boundary per planned issue. Build up to the boundary, not past it. Mark plug-in points with `// TODO(wave: <repo>-<n>)`.

## Verify Commands

```bash
# Core
cd stellar-pay-core && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test && cargo build --target wasm32-unknown-unknown --release

# API
cd stellar-pay-api && pnpm install --frozen-lockfile && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run openapi:check

# SDK
cd stellar-pay-api/sdk && pnpm install --frozen-lockfile && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build

# Frontend
cd stellar-pay-frontend && pnpm install --frozen-lockfile && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build

# Analytics Aggregator
cd stellar-pay-analytics/aggregator && pnpm install --frozen-lockfile && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build

# Analytics Web
cd stellar-pay-analytics/web && pnpm install --frozen-lockfile && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
```