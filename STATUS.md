# Status — Stellar Payment Infrastructure

## Current Phase
**Phase 1** — Core contract: payment lifecycle (complete)
**Phase 4** — API: the money path (scaffolded, type issues remain)
**Phase 5** — Generated TypeScript SDK (scaffolded)
**Phase 6** — Frontend & Analytics scaffolded

## Versions (pinned at scaffold)
- Rust: 1.81.0 (stable)
- Stellar CLI: 22.1.0
- Soroban SDK: 22.0.11
- Node: 20.17.0 (LTS)
- pnpm: 9.12.0
- TypeScript: 5.6.0
- Drizzle ORM: 0.35.0
- Express: 4.21.0
- Zod: 3.23.0
- React: 18.3.0
- Next.js: 14.2.0
- Vite: 5.4.0
- Vitest: 2.1.0

## Decisions
- **DB/ORM:** Drizzle ORM (chosen over Prisma for lighter weight and better TypeScript inference)
- **License:** MIT (one permissive license for all packages)
- **Package manager:** pnpm workspaces

## Progress
- [x] Root workspace files created
- [x] stellar-pay-core scaffolded
- [x] stellar-pay-core contract implemented with all functions
- [x] stellar-pay-core tests passing (19 tests)
- [x] stellar-pay-core fmt, clippy, test pass
- [x] stellar-pay-api scaffolded with Express, TypeScript, Drizzle ORM
- [x] stellar-pay-api config, logger, error handling
- [x] stellar-pay-api database schema (merchants, api_keys, payments, chain_events, indexer_state, webhook_endpoints, webhook_deliveries, idempotency_keys)
- [x] stellar-pay-api repositories for all entities
- [x] stellar-pay-api middleware (auth, idempotency, rate-limit, error-handler, request-id)
- [x] stellar-pay-api routes (payments CRUD, public checkout, webhooks, merchants)
- [x] stellar-pay-api soroban client service (placeholder)
- [x] stellar-pay-api indexer service (placeholder)
- [x] stellar-pay-api webhook dispatcher (placeholder)
- [x] stellar-pay-api OpenAPI generation (zod-to-openapi, Swagger UI)
- [x] stellar-pay-api Dockerfile, docker-compose.yml, .env.example
- [x] stellar-pay-api E2E testnet script
- [x] stellar-pay-api SDK package (StellarPay client, PublicClient, verifyWebhookSignature)
- [x] stellar-pay-api generated bindings placeholder
- [x] stellar-pay-api sync-bindings.sh, sync-sdk.sh scripts
- [x] stellar-pay-frontend scaffolded (React components, hooks, wallet, theme, on-ramp)
- [x] stellar-pay-analytics scaffolded (aggregator + web dashboard + METRICS.md)
- [x] Per-package docs added (README, LICENSE, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, AGENTS.md)
- [x] scripts/verify-all.sh created
- [x] CI workflows created (.github/workflows/ci.yml)
- [ ] Dependencies installed and verified (run `pnpm install` in each package)
- [ ] verify-all.sh passes
- [ ] All packages committed (one per commit)

## Blockers
- npm/pnpm install timing out in this environment (network). Run `pnpm install` in each package locally.
- API TypeScript build has type issues (optional property assertions, index signature access) - needs local fixes.

## Next Task
Run `pnpm install` in each package (stellar-pay-api, stellar-pay-api/sdk, stellar-pay-frontend, stellar-pay-analytics/aggregator, stellar-pay-analytics/web), then fix TypeScript errors (add non-null assertions, bracket notation for index signatures), then run `pnpm run build`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test` to verify. Then run `./scripts/verify-all.sh` and commit packages one per commit.