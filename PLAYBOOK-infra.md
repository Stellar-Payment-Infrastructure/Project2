# PLAYBOOK — Stellar Payment Infrastructure

A start-to-finish build guide for a four-package payments suite on Stellar/Soroban (contract, API, checkout frontend, analytics), built by one developer with the OpenCode agent in a single monorepo that is split into four repositories at the end.

**Audience:** (a) the human operator, (b) the OpenCode agent. The agent reads `AGENTS.md` (always loaded) plus the current phase here. The human should read §0–§7 once, then drive phase by phase.

> **Verification note.** Tool versions, CLI flags, library APIs and OpenCode config keys change often. This playbook gives the shape and the intent. Wherever an API or command matters, the agent must check the official docs or the installed package source first (AGENTS.md rule 6).

---

## Table of contents

0. How to use this playbook
1. Mission, scope, definition of done
2. Decisions and spec corrections (read before building)
3. Architecture and specifications
4. Tech stack
5. Monorepo layout and split-readiness rules
6. Environment setup
7. OpenCode setup and working method
8. Phases 0–9 (the build)
9. Cross-cutting standards
10. Splitting the monorepo into four repos
11. Wave readiness checklist
12. Contributor issues: MVP boundary and seeding
13. Soroban and payments pitfalls
14. Troubleshooting
15. Glossary
16. Appendices

---

## 0. How to use this playbook

1. Do §6 (environment) and §7 (OpenCode) once.
2. Run phases in order. Each has **goal → tasks → acceptance criteria → gate → agent prompt**.
3. A **gate** is where you review before the agent continues. Never skip the gates on Phases 1, 3 and 4. Interfaces frozen there are expensive to change.
4. Start every OpenCode session with the session-starter prompt (§7.3). `STATUS.md` is the agent's memory between sessions.
5. Use OpenCode's **Plan** agent to design each phase, then **Build** to implement it.

**Dependency chain drives order:** core → (deploy + bindings) → API (+ SDK) → frontend and analytics (these two can overlap once the API is stable). Spend the most review time on Phase 1 (contract) and Phase 4 (API), because money flows through them.

---

## 1. Mission, scope, definition of done

### 1.1 Mission

Give Stellar developers a payments backbone: a Soroban contract that tracks a payment through a strict state machine and settles it atomically; an API that hides XDR and Soroban from backend developers and delivers signed webhooks; checkout components merchants can embed; and a dashboard that turns payment data into insight.

### 1.2 Components

| # | Repo | Role |
|---|---|---|
| 1 | `stellar-pay-core` | Soroban contract: create, pay, settle, refund, cancel, reclaim; fee config; admin; events |
| 2 | `stellar-pay-api` | Express API: merchants and API keys, payment CRUD, transaction builder, Soroban event indexer, webhook delivery, OpenAPI, generated TypeScript SDK |
| 3 | `stellar-pay-frontend` | React components and hooks: `PaymentButton`, `PaymentLinkGenerator`, `QRCodeDisplay`, `PaymentStatusTracker`, hosted checkout page, demo storefront |
| 4 | `stellar-pay-analytics` | `aggregator/` service that ingests payments from the API and serves aggregates; `web/` React dashboard |

### 1.3 Definition of done (first public release)

- [ ] Contract on **Stellar testnet** with tests, documented interface, `deployments/testnet.json`.
- [ ] API deployed (testnet) with a public OpenAPI/Swagger page; the end-to-end flow works: create payment → payer signs `pay` with a wallet → indexer sees the event → payment status updates → signed webhook delivered → settled.
- [ ] Frontend: hosted checkout and demo storefront live, a real testnet wallet payment completed through them.
- [ ] Analytics dashboard live against the API with volume, success rate, average size over a date range.
- [ ] Each repo has README, LICENSE, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, CI green, issue templates.
- [ ] Monorepo split into four repos, CI green in each.

### 1.4 Non-goals for v1

Mainnet, fiat on-ramp *implementations* (only an interface and doc), Shopify/WooCommerce plugins, GraphQL, Python SDK/FastAPI, recurring payments, cross-asset conversion, geographic analytics, third-party analytics integrations (GA/Mixpanel), anomaly alerting, i18n beyond English, a custom docs generator, KYC/AML. Some of these are deliberately reserved as Wave issues (§12).

---

## 2. Decisions and spec corrections (read before building)

The brief contains items that are impossible, ambiguous, or in tension with the planned Wave issues. These are the defaults the agent must use.

| # | Brief says | Problem | Default decision |
|---|---|---|---|
| 1 | "Gas efficiency" | Stellar uses **resource fees** (CPU, memory, ledger reads/writes, bytes, rent) | Say "resource-fee efficiency"; measure with simulation. |
| 2 | "Webhook notifications" as a **contract** feature | Contracts can't make HTTP calls. They emit **events**. | Contract emits versioned events. The **API** runs an indexer (polls Soroban RPC `getEvents`) and delivers webhooks. Core Wave issue #2 is re-scoped (§12). |
| 3 | "Double-spending prevention" | Stellar's ledger already prevents double spends. The contract-level risks are **replay and duplicate processing**. | Unique 32-byte payment IDs (idempotent create), one-way state machine, settle/refund can each happen once. Test these. |
| 4 | "Native XLM and smart contract tokens" | In Soroban, XLM and classic assets are accessible via their **Stellar Asset Contract (SAC)**, all through the **SEP-41 token interface**. | One code path: `token::Client` with a token `Address`. XLM is just the native SAC. |
| 5 | "Multi-currency" key feature **and** Wave issue #1 "Add multi-currency support" | If MVP does it, no issue remains. | MVP: payment carries a `token: Address`, but the contract accepts **exactly one configured token per deployment** (§12). Multi-token allowlist and cross-asset settlement are the issue. README says so honestly. |
| 6 | "Atomic multi-asset transfers" | Soroban transactions are atomic: if any step fails the whole transaction reverts. Cross-asset needs DEX/path routing. | Atomicity within a single token flow only in MVP. Cross-asset is out of scope. |
| 7 | "Conditional payments (time-locked, hash-locked)" | Large scope | Not in MVP. The data model has `condition: Condition` with only a `None` variant so it extends without a breaking change. |
| 8 | "Network upgrades" tests | Protocol upgrades aren't something a contract test can simulate | Replace with: storage versioning field, documented upgrade policy ("redeploy on testnet"), and tests that old-format records can still be read once a v2 exists (later). |
| 9 | Who authorizes `create_payment`? | A merchant's backend API can't sign for the merchant without holding keys | Introduce an **operator** concept: payment has `merchant` (payee) and `operator` (authorizes lifecycle). In the hosted model the API's service key is the operator. Self-hosters can set operator = merchant. Funds can only ever go to merchant, fee recipient or payer, so a rogue operator can stall but not steal. |
| 10 | Escrow risk | If funds sit in escrow and the operator disappears, payer funds are stuck | MVP includes `reclaim` (payer can recover after `reclaim_delay`) and `auto_settle` mode that never holds funds. This is distinct from Wave issue #3 (expiry of unpaid invoices). |
| 11 | "Geographic breakdown" in analytics | No geography on-chain. IP geolocation of payers is invasive. | Not MVP. If added later: only merchant-supplied `metadata.country`, never IP-derived. |
| 12 | "Real-time" dashboard **and** Wave issue #1 "Add real-time updating" | Same tension | MVP: polling every N seconds, labeled "near real-time". Push (SSE/WebSocket) is the issue. |
| 13 | "Mobile responsive" components **and** Wave issue #3 "Add mobile responsiveness" | Same tension | MVP: fluid layout, usable on desktop and tablet. A formal mobile pass (breakpoints, touch targets, mobile wallet deep links) is the issue. |
| 14 | "Recurring payment UI" (Wave issue) | Recurring pull-payments need a contract/allowance design that doesn't exist | Before seeding, scope the issue as **UI + SDK stub against a documented draft API** behind a feature flag, or defer it. Do not seed an issue that cannot be completed. |
| 15 | "Over 20 components", Shopify/WooCommerce | Aspirational | Ship 4–6 solid components. Plugins are non-goals. READMEs list only what exists. |
| 16 | "API keys + rate limiting" key feature **and** Wave issue #2 "Implement rate limiting" | Same tension | MVP: API keys, plus a naive in-memory limiter on public endpoints only. Per-key, Redis-backed, headered rate limiting is the issue. |
| 17 | Webhook-safe browser | Checkout runs in a payer's browser | Browser never holds a merchant key. Two auth surfaces: **secret API keys** (server-to-server) and **public checkout endpoints** keyed by the unguessable payment ID. |
| 18 | "FastAPI optional", Python SDK | Scope creep | Non-goal. Generated TypeScript SDK only. |
| 19 | "Fiat on-ramp integration points" | Real integrations need anchors/KYC | Provide an `OnRampProvider` interface and a docs page (SEP-24/SEP-6 overview). No live integration. |
| 20 | Analytics "directly from Soroban network" | Duplicates the API indexer | Analytics reads **only from the API** in v1. |

---

## 3. Architecture and specifications

```
                    ┌───────────────────────────────┐
  merchant backend  │        stellar-pay-api        │   webhooks (HMAC-signed)
  (secret API key)─▶│ REST · auth · tx builder      │──────────────▶ merchant server
                    │ indexer · webhook dispatcher  │
 payer browser ────▶│ public checkout endpoints     │
 (wallet signs)     └───┬───────────────▲───────┬───┘
                        │ build/submit  │ events│ REST (list/updated_since)
                        ▼               │       ▼
                 ┌─────────────┐   ┌────┴────┐  ┌────────────────────────┐
                 │ Soroban RPC │◀──│Postgres │  │ stellar-pay-analytics  │
                 └──────┬──────┘   └─────────┘  │ aggregator + dashboard │
                        ▼                       └────────────────────────┘
                 ┌─────────────────┐     ┌──────────────────────────┐
                 │ stellar-pay-core│     │ stellar-pay-frontend      │
                 │ (Soroban, testnet)    │ components + hosted checkout ─▶ API (public endpoints)
                 └─────────────────┘     └──────────────────────────┘
```

### 3.1 Contract (`stellar-pay-core`)

**State machine (one-way, enforced in code):**

```
            create_payment
 (none) ───────────────────▶ Created ──cancel──▶ Cancelled
                                │
                                │ pay
                                ▼
                              Paid ──refund / reclaim──▶ Refunded
                                │
                                │ settle  (or immediately inside pay when auto_settle)
                                ▼
                             Settled
```

Terminal states: `Cancelled`, `Refunded`, `Settled`. No transitions out of a terminal state.

**Public interface (target; finalize in Phase 1):**

| Function | Auth | Effect |
|---|---|---|
| `initialize(admin, token, fee_bps, fee_recipient, reclaim_delay)` | admin | One-time setup. Fails if already initialized. |
| `create_payment(operator, merchant, payment_id: BytesN<32>, amount: i128, reference: BytesN<32>, settle_mode)` | operator | Creates `Created`. Duplicate id → `AlreadyExists`. `amount > 0`. Not allowed while paused. |
| `pay(payer, payment_id)` | payer | Moves `amount` from payer to the contract (`Paid`). If `settle_mode == Auto`, settles in the same call. Not allowed while paused. |
| `settle(payment_id)` | operator | `Paid → Settled`: transfers `amount − fee` to merchant, `fee` to fee recipient. Allowed while paused. |
| `cancel(payment_id)` | operator | `Created → Cancelled`. |
| `refund(payment_id)` | operator | `Paid → Refunded`: returns `amount` to payer. Allowed while paused. |
| `reclaim(payment_id)` | payer | `Paid → Refunded` only after `paid_at + reclaim_delay`. Allowed while paused. |
| `get_payment(payment_id)` | none | Read-only. |
| `get_config()` | none | Read-only. |
| `set_fee(fee_bps, fee_recipient)` | admin | `fee_bps ≤ MAX_FEE_BPS` (e.g. 500). |
| `set_paused(bool)` | admin | Blocks `create_payment` and `pay` only. |
| `propose_admin(new)` / `accept_admin()` | admin / new | Two-step admin transfer. |
| `bump_ttl(payment_id)` | none | Extends the entry's TTL. |

**Invariants (write a test for each; use property tests where practical):**

1. Funds only move to: the payment's `merchant`, the `fee_recipient`, or the payment's `payer`.
2. `settle` and `refund` can happen at most once per payment (state machine).
3. The contract's token balance equals the sum of `amount` for payments in `Paid`.
4. `fee + merchant_amount == amount` always (checked math, floor division on fee).
5. Pausing never traps funds: `settle`, `refund`, `reclaim` still work while paused.
6. Admin cannot move escrowed funds. Admin powers are limited to fee (capped), pause, admin transfer.
7. Fee is **snapshotted at `pay` time** into the payment so later changes don't alter in-flight payments.
8. Operator cannot redirect funds to an arbitrary address.

**Data model sketch**

```rust
#[contracttype] pub enum DataKey { Config, Payment(BytesN<32>), PendingAdmin }

#[contracttype] pub enum Status { Created, Paid, Settled, Refunded, Cancelled }
#[contracttype] pub enum SettleMode { Auto, Manual }
#[contracttype] pub enum Condition { None }          // extension point (time-lock, hash-lock) — NOT in MVP

#[contracttype] pub struct Config {
    pub admin: Address, pub token: Address, pub fee_bps: u32,
    pub fee_recipient: Address, pub reclaim_delay: u64, pub paused: bool, pub version: u32,
}
#[contracttype] pub struct Payment {
    pub operator: Address, pub merchant: Address, pub payer: Option<Address>,
    pub token: Address, pub amount: i128, pub fee_bps: u32,       // fee_bps snapshotted at pay
    pub reference: BytesN<32>, pub settle_mode: SettleMode, pub condition: Condition,
    pub status: Status, pub created_at: u64, pub paid_at: Option<u64>,
    pub closed_at: Option<u64>, pub version: u32,
}
```

**Events** (topics `("pay", <name>)`, data includes a schema `v: u32`): `created`, `paid`, `settled`, `refunded`, `cancelled`, `fee_changed`, `paused`, `admin_changed`. The API indexer depends on these. Include `payment_id`, amounts, addresses, and ledger timestamp.

**Errors:** `NotInitialized`, `AlreadyInitialized`, `NotFound`, `AlreadyExists`, `Unauthorized`, `InvalidAmount`, `InvalidState`, `Paused`, `TokenNotAllowed`, `FeeTooHigh`, `TooEarly`, `Overflow`.

**Token handling:** use `token::Client` (SEP-41). Follow checks-effects-interactions: update state first, then transfer. Only allowlist vetted tokens (standard transfer semantics): fee-on-transfer or hook-bearing tokens would break invariant 3.

**Plug-in points** (leave in code): `is_token_allowed(env, token)` (Wave core-1), `payment.expires_at` handling in create/pay (core-3), storage layer (core-4), event emission helpers (core-2).

### 3.2 API (`stellar-pay-api`)

**Auth surfaces**
- **Secret API key** (`Authorization: Bearer sk_test_...`): merchant-server operations. Keys are random, shown once, stored **hashed** (with a server-side pepper), with a visible prefix for lookup, scopes, `last_used_at`, revocation.
- **Public checkout endpoints**: no key, authorized by knowing the 32-byte payment ID, rate-limited, returning only what a payer needs.

**Routes (v1, REST)**

| Route | Auth | Purpose |
|---|---|---|
| `POST /v1/payments` | secret key + `Idempotency-Key` | Create (calls `create_payment` with the operator key). Body: `amount` (string), `currency`/token, `reference`, `metadata`, `settle_mode`, `success_url`, `cancel_url`. |
| `GET /v1/payments/:id` | secret key | Status and details. |
| `GET /v1/payments` | secret key | List: filters (`status`, `created_gte`, `created_lte`), cursor pagination, `updated_since` for aggregators. |
| `POST /v1/payments/:id/cancel`, `/settle`, `/refund` | secret key | Operator actions. |
| `GET /v1/public/payments/:id` | public | Minimal checkout view (amount, token, merchant display name, status). |
| `POST /v1/public/payments/:id/transaction` | public | Body `{ payer }`. Returns an **unsigned, prepared** XDR for `pay`. |
| `POST /v1/public/payments/:id/submit` | public | Body `{ signedXdr }`. The API **verifies** the transaction invokes *this* contract's `pay` for *this* payment, then submits. Never relays anything else. |
| `POST/GET/DELETE /v1/webhook-endpoints` | secret key | Manage endpoints (HTTPS URL, event types); secret returned once. |
| `GET /v1/webhook-deliveries` and `POST /v1/webhook-deliveries/:id/retry` | secret key | Delivery log and manual retry. |
| `GET /v1/health`, `GET /v1/openapi.json`, `GET /docs` | public | Ops and docs. |

**Conventions:** amounts are decimal **strings** of base units. Error envelope `{ error: { code, message, details? } }`. `Idempotency-Key` on creating POSTs (stored with response hash). Request IDs in logs. Zod schemas generate OpenAPI 3.0 (single source of truth).

**Database (Postgres), sketch:** `merchants(id, name, display_name, created_at)`; `api_keys(id, merchant_id, prefix, hash, scopes, created_at, last_used_at, revoked_at)`; `payments(id[hex32], merchant_id, status, amount, token, payer, reference, metadata jsonb, operator_tx_hash, pay_tx_hash, settle_tx_hash, created_at, updated_at)`; `chain_events(id, ledger, tx_hash, contract_id, type, payment_id, payload jsonb, UNIQUE(tx_hash, event_index))`; `indexer_state(key, cursor, updated_at)`; `webhook_endpoints(id, merchant_id, url, secret_enc, events[], enabled)`; `webhook_deliveries(id, endpoint_id, event_id, attempt, status, next_attempt_at, response_code, response_ms, error)`; `idempotency_keys(key, merchant_id, request_hash, response, created_at)`.

**Indexer:** polls Soroban RPC `getEvents` filtered by contract ID from a persisted cursor; decodes events; inserts into `chain_events` (unique constraint makes it idempotent); updates `payments`; enqueues webhooks — all in **one DB transaction** per batch. Handles reorg-free finality of Stellar ledgers, RPC retention limits (verify retention for your provider: events older than the retention window are unavailable), and runs a **reconciler** that compares non-terminal payments against `get_payment` on chain. Downtime longer than RPC retention is recovered by reconciliation, not by events.

**Webhooks:** at-least-once delivery, no ordering guarantee. Event types: `payment.created`, `payment.paid`, `payment.settled`, `payment.refunded`, `payment.cancelled`. Payload `{ id: "evt_…", type, created, data: { payment } }`. Header `Stellar-Pay-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, t + "." + rawBody)>`. Consumers must verify signature, enforce a timestamp tolerance, and dedupe by `id`. Retry with exponential backoff and jitter (e.g. up to ~8 attempts over ~24h), then mark `failed`. **SSRF protection:** require HTTPS, block private/loopback/link-local/metadata IP ranges after DNS resolution, set short timeouts, don't follow redirects blindly, cap response size.

**Operator key custody:** testnet = environment variable. Document the production path (KMS/HSM or a signing service) and never log it. Rotate by redeploying/`set_operator` is not in v1 — operator is per payment.

### 3.3 Frontend (`stellar-pay-frontend`)

**MVP component and hook set (do not exceed without a decision note):**
- `PaymentButton` (merchant-side: creates a checkout via a *merchant-provided* server endpoint, never with a secret key in the browser).
- `PaymentLinkGenerator` (UI to generate/copy a `/pay/<id>` link; basic).
- `QRCodeDisplay` (QR of the hosted checkout URL; optional SEP-7 URI later — wallet support varies, verify).
- `PaymentStatusTracker` (polls the public endpoint; states: waiting, processing, paid, settled, failed, refunded).
- `CheckoutPage` (hosted checkout: connect wallet → fetch transaction → sign → submit → track).
- `WalletProvider` / `usePayment`, `usePaymentStatus`, `useWallet` hooks.
- `OnRampProvider` **interface only** + docs.

**Rules:** CSS variables for theming (`--sp-*`), no Tailwind/UI-library lock-in, WCAG 2.1 AA as the target with axe checks in tests, SSR-safe, every component has loading/error states and stories. Wallets via Stellar Wallets Kit (verify support). QR default = HTTPS checkout URL (works with any camera).

### 3.4 Analytics (`stellar-pay-analytics`)

- **`aggregator/`** (Node/TS service): pulls from the API list endpoint with `updated_since` cursors, normalizes, stores in its own Postgres (separate schema/DB), serves `GET /stats/volume`, `/stats/success-rate`, `/stats/average-size` with `from`, `to`, `interval`, `merchant_id`. Auth: static bearer token from env in v1.
- **`web/`** (React): date-range filter, merchant segment filter, volume chart, success/failure rate, average size, transactions table. **Polling** refresh. (Currency breakdown, export, push updates are Wave issues.)
- Metric definitions are written down in `docs/METRICS.md` (success rate = settled / (settled + failed/refunded/cancelled) over a chosen window; state your denominator) so numbers are reproducible.

---

## 4. Tech stack

Pin exact versions at scaffold and record in `STATUS.md`.

| Area | Choice | Notes |
|---|---|---|
| Contract | Rust + `soroban-sdk`, Stellar CLI (`stellar`) | Match SDK and CLI versions; check docs for the wasm target name. |
| Network | Stellar testnet + Friendbot | |
| JS runtime | Node LTS (20/22), pnpm workspaces | |
| API | Express + TypeScript | Zod for validation; `@asteasolutions/zod-to-openapi` (or equivalent) for the spec; Swagger UI. Verify packages. |
| Stellar JS | `@stellar/stellar-sdk` | RPC client, XDR, keypairs. |
| DB | Postgres + Drizzle ORM (or Prisma; decide in Phase 0, record it) | docker-compose for local; migrations in git. |
| SDK | Generated from OpenAPI (`openapi-typescript` + a thin fetch client, or `orval`) | Lives in `stellar-pay-api/sdk/`. |
| Logging | `pino` | Redact secrets. |
| Frontend | React + Next.js (App Router), tsup for the library, Storybook | `qrcode` library for QR; Stellar Wallets Kit. |
| Analytics UI | React + Vite or Next.js, `recharts`, TanStack Table/Query | |
| Tests | `cargo test`; `vitest`, `supertest`, Testcontainers (or compose Postgres), Testing Library, axe, Playwright | |
| CI | GitHub Actions | |
| Releases | Changesets (TS), tags (contract) | |

---

## 5. Monorepo layout and split-readiness rules

```
stellar-pay-suite/
├── AGENTS.md  PLAYBOOK.md  STATUS.md  opencode.json
├── pnpm-workspace.yaml  .npmrc  package.json  .gitignore
├── scripts/{verify-all.sh,split.sh,sync-bindings.sh,sync-sdk.sh}
├── .github/workflows/ci.yml                     # monorepo CI, path-filtered matrix
│
├── stellar-pay-core/
│   ├── Cargo.toml  contracts/payments/{Cargo.toml,src/{lib.rs,types.rs,error.rs,events.rs,storage.rs,test.rs}}
│   ├── deployments/testnet.json  docs/{SPEC.md,COSTS.md,SECURITY_REVIEW.md}
│   └── README.md LICENSE CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md AGENTS.md .github/
│
├── stellar-pay-api/
│   ├── package.json  src/{app.ts,server.ts,config.ts,routes/,services/,indexer/,webhooks/,auth/,db/,generated/}
│   ├── drizzle/  openapi/  scripts/e2e-testnet.ts  Dockerfile  docker-compose.yml  .env.example
│   ├── sdk/                                      # generated TS SDK package (own package.json)
│   └── README.md LICENSE ... .github/
│
├── stellar-pay-frontend/
│   ├── package.json  src/{components/,hooks/,theme/,wallet/,onramp/,index.ts}  .storybook/
│   ├── demo/                                     # Next.js: hosted checkout + demo storefront
│   └── README.md LICENSE ... .github/
│
└── stellar-pay-analytics/
    ├── aggregator/  web/  docs/METRICS.md  docker-compose.yml
    └── README.md LICENSE ... .github/
```

### 5.1 Split-readiness rules (non-negotiable)

1. **Self-contained folders** with their own README, LICENSE, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, short AGENTS.md, CI workflow in the folder's own `.github/`, `.env.example`, and tests.
2. **No path imports across folders** (no `../`, no `file:../`).
3. **Cross-package deps use real semver ranges**, never `workspace:*`. Root `.npmrc` sets `link-workspace-packages=true` so pnpm links local packages when the range is satisfied. After the split the same range resolves from npm.
4. **Core → API coupling = generated bindings** committed under `stellar-pay-api/src/generated/` via `scripts/sync-bindings.sh`. **API → frontend/analytics coupling = the generated SDK** (`stellar-pay-sdk`, published from `stellar-pay-api/sdk/`) via `scripts/sync-sdk.sh` and normal semver.
5. **Config, not code:** contract IDs, RPC URLs, passphrases come from env/config files.
6. **Per-package CI** written as if each folder were a repo root. The root workflow runs each with `working-directory`.
7. **One package per commit**, Conventional Commit scopes.
8. **Lockfile reality:** inside the monorepo there is **one root `pnpm-lock.yaml`** (it is not carried over by the split). Pin exact dependency versions in each `package.json` so regenerated per-repo lockfiles don't drift; the split procedure (§10) regenerates them and re-runs verify.
9. **Multi-package folders** (`stellar-pay-api` + `sdk/`, `stellar-pay-analytics/aggregator` + `web`) are listed in the root workspace; at split time the script adds a per-repo `pnpm-workspace.yaml`.
10. **Docs reference published names**, not monorepo paths. Check npm name availability before Phase 5 (`stellar-pay-sdk` or a scope).

`pnpm-workspace.yaml`:
```yaml
packages:
  - "stellar-pay-api"
  - "stellar-pay-api/sdk"
  - "stellar-pay-frontend"
  - "stellar-pay-frontend/demo"
  - "stellar-pay-analytics/aggregator"
  - "stellar-pay-analytics/web"
```
`.npmrc`: `link-workspace-packages=true`

`.gitignore` must cover: `target/`, `node_modules/`, `dist/`, `.next/`, `build/`, `.env*` (except `.env.example`), `test_snapshots/`, `*.pem`, `.DS_Store`, local DB volumes.

---

## 6. Environment setup (human, once)

```bash
# Rust + wasm target (check Soroban docs for the current target name)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable

# Stellar CLI (install per https://developers.stellar.org)
stellar --version

# Node, pnpm, Docker (for Postgres)
node --version        # 20 or 22 LTS
corepack enable && pnpm --version
docker --version && docker compose version

# git-filter-repo (split time)
pip install git-filter-repo

# Testnet identities (never reuse on mainnet)
stellar keys generate deployer  --network testnet --fund
stellar keys generate admin     --network testnet --fund
stellar keys generate operator  --network testnet --fund   # the API's service key (testnet only)
stellar keys generate feecollector --network testnet --fund
stellar keys generate merchant  --network testnet --fund
stellar keys generate payer     --network testnet --fund

# Toolchain sanity check
stellar contract init /tmp/hello && cd /tmp/hello && cargo test && stellar contract build
```

**Test token:** you need a token to pay with. On testnet, issue a classic asset (e.g. `TESTUSD` from the `deployer` account), wrap it with its Stellar Asset Contract (`stellar contract asset deploy --asset ...`; verify syntax), trustline the payer/merchant accounts, and mint to the payer. Native XLM's SAC also works for a first smoke test. Record asset and SAC IDs in `STATUS.md`.

Create a GitHub **organization** (one org for all four repos) and decide hosting for the testnet demos (e.g. Vercel for frontends, Fly/Render/Railway for the API and Postgres).

---

## 7. OpenCode setup and working method

### 7.1 What OpenCode reads
- `AGENTS.md` (project rules, loaded every session) — provided.
- `opencode.json` — permissions, model, MCP (Appendix B).
- **Plan vs Build agents:** Plan designs without editing; Build implements. Verify the switching key in the docs.
- `/undo`, `/redo` are for quick rollback; **commit often** for real checkpoints.
- `@path` file references to load files into context.
- Custom commands live under `.opencode/command/` (or `commands/`, depending on version) — Appendix C.
- BYOK or free-tier models: keys stay in OpenCode's auth store or env, never in the repo.

### 7.2 Working loop
1. **Plan** (Plan agent): read AGENTS.md, STATUS.md, the phase; produce a numbered task list with acceptance criteria. No edits.
2. **Trim** the plan yourself.
3. **Implement** one task at a time (Build agent): verify → update STATUS.md → commit.
4. **Review diffs** at gates. Read contract and money-path code line by line.
5. **Short sessions**, one phase or half-phase each. Fresh session when context bloats or the agent loops.
6. **Stuck rule:** same failure three times → stop; have the agent write what it tried and the exact error under Blockers; read docs/source yourself or switch models for the debugging step.

### 7.3 Session starter prompt
```
Read AGENTS.md, STATUS.md, and the section of PLAYBOOK.md for the current phase.
Summarize in 5 lines: current phase, what's done, what's next, blockers, and the acceptance
criteria for the next task. Do not write code until I confirm.
```

### 7.4 Prompting rules
- Give **goal, files, constraints, verification command** every time.
- **Tests first** for contract functions and money-path API code.
- Ask the agent to **cite the doc page or source file** behind any Soroban/SDK/library API it uses.
- One function group or one route group at a time, never "the whole API".
- New dependency? It must justify itself against §4.

### 7.5 Model tips
Use your strongest available model for Phase 1 (contract design), Phase 4 money paths (tx builder, submit verification, indexer atomicity) and Phase 8 (security review). Cheaper/faster models are fine for scaffolding, CRUD routes, components, tests and docs. Free-tier models rotate and are weaker on niche Soroban APIs: lean on docs-checking and tests, and never paste secrets into any provider.

---

## 8. The build

### Phase 0 — Scaffold the monorepo

**Goal:** an empty-but-green monorepo; each package builds, lints, tests; CI runs.

**Tasks**
1. `git init`; add AGENTS.md, PLAYBOOK.md, STATUS.md, `.gitignore`, `opencode.json`, workspace files.
2. Scaffold `stellar-pay-core` with `stellar contract init` (or by hand), size-optimized release profile from the CLI template.
3. Scaffold `stellar-pay-api`: TS + Express, `config.ts` (Zod-validated env), pino logger, `/v1/health`, Drizzle + a first migration, `docker-compose.yml` (Postgres), `.env.example`, vitest + supertest, Dockerfile.
4. Scaffold `stellar-pay-api/sdk` (empty generated package placeholder).
5. Scaffold `stellar-pay-frontend` (tsup lib, Storybook, vitest, `demo/` Next.js).
6. Scaffold `stellar-pay-analytics/aggregator` and `web`.
7. Per-package README, LICENSE (one permissive license everywhere), CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, short AGENTS.md.
8. `scripts/verify-all.sh`; per-package `.github/workflows/ci.yml`; root path-filtered workflow.
9. Commit one package at a time.

**Acceptance:** `scripts/verify-all.sh` passes from a clean clone; no cross-folder path imports; STATUS.md records the exact versions and the DB/ORM decision.

**Prompt**
```
Phase 0. Using PLAYBOOK §4, §5 and §8 Phase 0, plan the scaffold (no edits), then implement one
package at a time, verify and commit after each (one package per commit). Check current docs for the
Stellar CLI template, Drizzle, Storybook and Next.js init commands instead of guessing.
```

---

### Phase 1 — Core contract: payment lifecycle

**Design first (Gate 1a).** Write `stellar-pay-core/docs/SPEC.md`: state machine diagram, every function with auth and effects, the eight invariants (§3.1), event schemas, error list, token assumptions, upgrade policy, threat model (malicious operator, malicious payer, malicious token, griefing, replay). **Human reviews before Rust.**

**Tasks (test-first, in order)**
1. `types.rs`, `error.rs`, `events.rs`, `storage.rs` (TTL constants with explanatory comments; helpers that extend TTL on writes).
2. `initialize` + `get_config` (reject double init; validate `fee_bps ≤ MAX_FEE_BPS`).
3. `create_payment` (duplicate id, `amount > 0`, paused, operator auth).
4. `pay` (state check, `payer.require_auth()`, snapshot fee, state update **before** transfer, `Auto` mode settles in the same call).
5. `settle`, `cancel`, `refund`, `reclaim` (delay check against ledger timestamp).
6. Admin: `set_fee`, `set_paused`, `propose_admin`/`accept_admin`.
7. `get_payment`, `bump_ttl`.
8. Events for every state change.
9. Invariant tests (below).

**Test matrix (minimum)**
| Area | Happy | Failure / edge |
|---|---|---|
| initialize | sets config | double init, fee too high |
| create | creates `Created` | duplicate id, zero/negative amount, wrong operator auth, paused |
| pay | escrows funds, `Paid` | wrong state, unknown id, insufficient balance, paused, payer didn't authorize |
| auto-settle | one call to `Settled` | fee rounding (tiny amounts, fee 0, fee max) |
| settle | merchant and fee recipient receive exact amounts | double settle, wrong caller, wrong state |
| refund/cancel/reclaim | funds back to payer / state change | too early reclaim, wrong state, wrong caller |
| pause | blocks create/pay | settle/refund/reclaim still work |
| admin | fee change doesn't affect in-flight payments | non-admin, two-step transfer misuse |
| invariants | balance == sum(Paid), funds only to allowed parties | property test with random sequences of operations |

Test setup: register the contract, create a token with the SDK's Stellar Asset Contract test helpers (verify the API in the installed version), mint to payers. Include tests that **don't** use `mock_all_auths` to prove auth is really enforced.

**Acceptance**
- fmt, clippy `-D warnings`, test, `stellar contract build` pass; wasm size recorded.
- No `unwrap()`/`expect()`/indexing panics in contract code; checked arithmetic.
- Every public function has doc comments (they feed the API docs).

**Gate 1b:** human reads the whole contract, reruns tests, records "Interface frozen at <commit>" in STATUS.md.

**Prompts**
```
Phase 1 design only: write stellar-pay-core/docs/SPEC.md from PLAYBOOK §2 and §3.1. Include the threat
model and the invariants. No Rust yet.
```
```
Phase 1 implementation, test-first. Do tasks 1–3 only (types/errors/storage, initialize, create_payment)
with full tests. Verify every soroban-sdk API against the installed crate docs. Show the diff and stop.
```

---

### Phase 2 — Core hardening and observability

**Goal:** make the contract production-shaped before deployment.

**Tasks**
1. Review events against what the indexer needs (stable names, versions, all ids in data). Write `docs/EVENTS.md` with the exact topic/data layout and a JSON example per event.
2. Resource-fee measurement for key paths (create, pay, auto-settle, settle) via simulation; record in `docs/COSTS.md`. This is the baseline for Wave core-4.
3. Add **test vectors** `docs/test-vectors.json` (event XDR/JSON examples) the API indexer tests will reuse.
4. Add the plug-in markers for Wave issues: `is_token_allowed`, `// TODO(wave: core-1/2/3/4)`.
5. Property/fuzz tests for the fee math and state machine.
6. Run clippy, `cargo audit`, and your Soroban static-analysis tooling; triage.

**Acceptance:** all verify green; `EVENTS.md`, `COSTS.md`, test vectors committed.

---

### Phase 3 — Deploy to testnet and generate bindings

**Tasks**
1. Build (and optimize if the CLI doesn't already) the wasm.
2. Deploy: `stellar contract deploy --wasm <path> --source-account deployer --network testnet --alias stellar-pay-core` (verify flags with `--help`).
3. `initialize` with the test token, admin, fee 100 bps, fee collector, reclaim delay (short on testnet, e.g. 1 hour, to allow manual testing; record the choice).
4. Record contract ID, wasm hash, token ID, passphrase, versions in `deployments/testnet.json`.
5. Smoke test with `stellar contract invoke`: create → pay → settle; create → cancel; create → pay → refund. Save the transcript to `docs/SMOKE_TEST.md`.
6. `stellar contract bindings typescript ...` then `scripts/sync-bindings.sh` copies the output into `stellar-pay-api/src/generated/`.
7. Tag `core-v0.1.0`.

**Gate 3:** human performs a full pay → settle manually on testnet and checks balances.

---

### Phase 4 — API: the money path

**Goal:** a working API: auth, create/query payments, transaction builder, submit with verification, indexer, webhooks.

**Sub-phase 4a — foundations**
1. Config (Zod-validated env), logger with redaction, error envelope and typed `ApiError` classes with stable codes, request IDs.
2. DB schema + migrations (§3.2). Repositories with transactions.
3. Merchants and API keys: generate, hash with pepper, prefix lookup, constant-time compare, scopes, revoke. CLI/seed script to create a first merchant and key (`pnpm seed`), printing the key once.
4. Auth middleware; `Idempotency-Key` middleware.
5. Naive in-memory limiter for public routes (documented as single-instance; Wave api-2 replaces it).
Tests: key creation/verification, hash never stored plain, revoked keys rejected, idempotent replay returns the same response.

**Sub-phase 4b — payments**
1. Soroban client wrapper (RPC server, operator keypair, generated bindings): build → **simulate** → assemble → sign → submit → poll with timeouts and typed errors (`SimulationError`, `SubmitError`, `TimeoutError`).
2. `POST /v1/payments`: validate (amount string → bigint, positive, within limits), generate a random 32-byte id, call `create_payment`, persist payment with status `created`, return resource. Handle partial failure: if the chain call fails, nothing persisted; if persistence fails after chain success, the reconciler repairs it (record a `pending_chain` marker).
3. `GET /v1/payments/:id`, list with cursor pagination, filters and `updated_since`.
4. Operator actions: `cancel`, `settle`, `refund` routes.
Tests: mocked RPC for unit; one `INTEGRATION=1` test against testnet.

**Sub-phase 4c — public checkout**
1. `GET /v1/public/payments/:id` (minimal fields only).
2. `POST /v1/public/payments/:id/transaction`: build a `pay` invocation for `payer`, simulate, return prepared XDR, plus `networkPassphrase` and an expiry hint.
3. `POST /v1/public/payments/:id/submit`: **decode the signed envelope and verify**: exactly one operation, an invoke of **our contract ID**, function `pay`, args equal `(payer, this payment id)`, source/auth as expected, fee within sane bounds. Reject everything else with a precise error. Then submit and return the hash. This is the single most security-sensitive route; write adversarial tests (wrong contract, wrong function, extra operations, other payment id, oversized fee).
Tests: those adversarial cases plus happy path.

**Sub-phase 4d — indexer**
1. Poller using `getEvents` from a persisted cursor, with backoff and health metrics.
2. Event decoder using bindings and the Phase 2 test vectors; unknown event version → logged and skipped, never crash.
3. DB transaction per batch: insert `chain_events` (idempotent), update payment status via a **monotonic state machine** (never move backwards), enqueue webhooks, advance cursor.
4. Reconciler job: for non-terminal payments older than N minutes, read `get_payment` and repair. Also covers RPC-retention gaps.
Tests: replay the same batch twice (no double effects), out-of-order events, gap recovery.

**Sub-phase 4e — webhooks**
1. Endpoint CRUD with HTTPS-only validation and SSRF checks (resolve DNS, block private/link-local/metadata ranges, no redirect following).
2. Dispatcher worker: signs per §3.2, timeouts, retry with exponential backoff and jitter, delivery log, manual retry route, dead-lettering after max attempts. Use a DB-backed queue (`SELECT ... FOR UPDATE SKIP LOCKED`) rather than adding Redis in v1.
3. Verification helper exported to the SDK (`verifyWebhookSignature`).
Tests: signature vectors, retry schedule, SSRF rejection table, a local receiver test.

**Sub-phase 4f — OpenAPI and docs endpoints**
1. Generate the OpenAPI 3.0 document from Zod schemas; serve `/v1/openapi.json` and Swagger UI at `/docs`.
2. `pnpm openapi:check` fails if the committed spec is stale.
3. Dockerfile + compose run the API and Postgres; `.env.example` complete.

**End-to-end script** `scripts/e2e-testnet.ts`: create merchant+key → create payment → pay with the `payer` keypair through the public endpoints → wait for the indexer → assert webhook received by a local listener → settle (or auto-settle) → assert final status.

**Acceptance:** verify + `openapi:check` pass; e2e script passes on testnet; adversarial submit tests pass; no secrets in logs (add a test that greps logs for the operator key pattern).

**Gate 4:** human walks the money path code, runs the e2e script, then freezes the REST contract ("API v1 frozen at <commit>").

**Prompt**
```
Phase 4c only. Implement the public checkout routes. The submit route must decode the signed XDR and
verify it is exactly one invoke of our contract's pay for this payment id before submitting. Write the
adversarial tests first (wrong contract, wrong function, extra ops, wrong payment id). Check
@stellar/stellar-sdk docs for XDR decoding APIs. Show me the diff.
```

---

### Phase 5 — Generated TypeScript SDK

**Goal:** a typed client for backend developers and for the frontend/analytics.

**Tasks**
1. `scripts/sync-sdk.sh`: generate types and client from the committed OpenAPI spec into `stellar-pay-api/sdk/`.
2. Hand-written layer on top: `StellarPay` class (`new StellarPay({ apiKey, baseUrl })`), `payments.create/get/list/cancel/settle/refund`, `webhookEndpoints.*`, `webhooks.verifySignature(rawBody, header, secret, toleranceSec)`, typed errors mapped from the error envelope, automatic `Idempotency-Key` for creates, pagination helpers (`for await (const p of sdk.payments.listAll())`), `bigint` helpers for amounts.
3. A `public` client (no key) for the checkout endpoints used by the frontend.
4. Tests against a mock server; contract test that the SDK compiles against the current spec.
5. ESM + CJS build, JSDoc, README with a 30-second example, publish dry run via `pnpm pack`.

**Acceptance:** verify passes; an example script using the SDK completes create → status on testnet.

---

### Phase 6 — Frontend

**Goal:** accessible, themeable checkout components and a live hosted checkout.

**Tasks**
1. Theme tokens (`--sp-*`) and base CSS; dark mode via data attribute.
2. `WalletProvider`/`useWallet` (Wallets Kit), SSR-safe.
3. `usePaymentStatus` (poll with backoff; stops on terminal states), `usePayment` (fetch → build tx → sign → submit state machine with explicit states and error codes).
4. Components: `QRCodeDisplay`, `PaymentStatusTracker`, `PaymentLinkGenerator`, `PaymentButton`, `CheckoutPage`. Stories for each state (loading, waiting, processing, paid, settled, failed, refunded, expired/unknown).
5. Money display: format `bigint` + decimals; never floats; test rounding and large values.
6. `OnRampProvider` interface and a docs stub (SEP-24/6 overview).
7. `demo/`: hosted checkout at `/pay/[id]`, plus a demo storefront with a tiny server route that creates payments **server-side** using the SDK and a secret key from env (showing the correct pattern), then shows `PaymentButton`.
8. a11y: axe in component tests and Storybook; keyboard flow test; live-region announcements for status changes; status never conveyed by color alone.
9. Playwright e2e with a mocked wallet; documented manual real-wallet test.
10. Deploy the demo (testnet banner visible).

**Acceptance:** verify passes; Storybook has no a11y violations on stories; you complete a real testnet payment through the deployed demo.

---

### Phase 7 — Analytics

**Goal:** a working dashboard with honest metrics.

**Tasks**
1. `docs/METRICS.md`: exact definitions (volume, success rate with its denominator, average size, time bucketing in UTC, how refunded/cancelled count).
2. Aggregator: ingest loop from the API via the SDK with `updated_since` and a persisted cursor (idempotent upserts by payment id), own DB schema/migrations, aggregation SQL (bucketed by `hour/day/week`), endpoints `/stats/volume`, `/stats/success-rate`, `/stats/average-size`, `/stats/payments` (table), static bearer auth.
3. Tests: fixture-driven aggregation tests (known inputs → exact outputs), time-zone/boundary tests, idempotent re-ingest test.
4. Web: date-range picker, merchant filter, volume chart, success-rate, average-size, table with pagination, empty/loading/error states, polling refresh with a visible "last updated" time.
5. Accessibility: charts have text alternatives or an adjacent data table; no color-only encoding.
6. Seed script that generates a realistic testnet-like dataset for demos (clearly labeled synthetic).
7. Deploy against the live API.

**MVP boundary:** one token (no currency breakdown), no export, polling not push, no alerting/funnels/third-party analytics.

**Acceptance:** verify passes; METRICS.md numbers reproduced by a test; dashboard live.

---

### Phase 8 — Hardening and release prep

**Security review (do it carefully; this handles money)**
1. Contract: checklist from §3.1 invariants, plus: every mutating function authorizes the right Address before state changes; state before transfers; checked arithmetic; pause semantics; bounded storage; TTL handling; events don't leak PII. Run clippy, `cargo audit`, and your Soroban static-analysis CLI; triage.
2. Adversarial pass in a **fresh session**: "Act as an independent Soroban auditor. List ways to steal, lock, or grief funds, with severity and a failing test each. Do not fix yet." Then fix with regression tests. Write `docs/SECURITY_REVIEW.md`.
3. API: authn/z review (key hashing, scopes, constant-time compare), idempotency, SQL injection (parameterized only), SSRF table, webhook secret storage (encrypted at rest), log redaction, request size limits, CORS policy (public routes only for checkout origins), dependency audit (`pnpm audit`), Docker image as non-root, security headers, error messages that don't leak internals.
4. Frontend: no secrets in the bundle (grep the build output), CSP guidance, dependency audit.
5. Run a **negative end-to-end**: payer cancels in wallet; insufficient balance; wrong network; payment already paid; RPC down; webhook endpoint down; indexer restart mid-batch.
6. Load sanity: indexer with 10k synthetic events; API list pagination at scale.

**Release prep:** versions (`core-v0.1.0`, `sdk@0.1.0`, `frontend@0.1.0`, API `0.1.0` Docker image/tag, analytics `0.1.0`), CHANGELOGs, publish `stellar-pay-sdk` to npm *before* the frontend and analytics depend on it by range, README honesty pass in every package, LICENSE/NOTICE check.

**Acceptance:** all verify green; negative e2e passes; findings logged with every item fixed or explicitly accepted.

---

### Phase 9 — Split, publish, seed issues

Follow §10, then §12, then run the §11 checklist.

---

## 9. Cross-cutting standards

### 9.1 Money and data rules
- Integer base units everywhere; decimal **strings** over JSON; `bigint` in TS; `i128` in Rust. Never `Number` for amounts.
- One shared formatting helper per language with unit tests (decimals 7 and others).
- `metadata` is merchant-supplied, size-capped, never trusted, never put on-chain; only a 32-byte `reference` hash goes on-chain.
- Timestamps UTC, ISO-8601 in the API, ledger seconds on-chain.

### 9.2 Security
- Secrets never in git/logs/prompts/screenshots. Rotate anything that leaks.
- Agent permissions via `opencode.json`; no force-pushes, no mainnet, no destructive commands without approval.
- Dependency hygiene: lockfiles, exact pins, Dependabot, `cargo audit`, `pnpm audit` in CI.
- `SECURITY.md` with a disclosure contact. One-page threat model per repo that has one (core, api).
- Webhook consumers: verify signature + timestamp + dedupe (documented in SDK/README).

### 9.3 Testing

| Layer | Tool | What |
|---|---|---|
| Contract unit + property | `cargo test` | all functions, auth, invariants |
| Event vectors | JSON from core | indexer decoder compatibility |
| API unit | vitest + mocked RPC | services, middleware, schemas |
| API HTTP | supertest + real Postgres | routes, auth, idempotency, adversarial submit |
| Indexer | fixtures | replay, ordering, gaps |
| Webhooks | local receiver | signature, retry, SSRF |
| SDK | mock server | typed calls, errors, pagination |
| Components | Testing Library + axe | behavior, states, a11y |
| E2E | Playwright (mock wallet) + `e2e-testnet.ts` | full flow |
| Analytics | fixtures | exact aggregates |
| Integration (testnet) | `INTEGRATION=1` | manual and scheduled weekly |

### 9.4 CI
Per package: lint, typecheck, test, build (+ `openapi:check` for the API; `cargo audit` for core). Postgres service container for API/analytics tests. Weekly scheduled testnet integration job (testnet resets are information, not always bugs). Monorepo root workflow is path-filtered.

### 9.5 Git, versioning, community files
- Trunk-based on `main`; Conventional Commits with package scope; one package per commit; prefixed tags (`core-v0.1.0`) re-tagged after the split.
- SemVer per package; compatibility matrix (contract ↔ API ↔ SDK ↔ frontend) in each README.
- One permissive license. CODEOWNERS, PR template, issue templates (bug, feature, wave-task), labels (`wave`, `good first issue`, `help wanted`, `area:*`).

---

## 10. Splitting the monorepo into four repos

**When:** after Phase 8, before seeding Wave issues.

**Pre-flight**
- [ ] Each folder passes its verify command in isolation (copy to a temp dir, `pnpm install`, run).
- [ ] `grep -R "\.\./stellar-pay-" .` finds nothing; no `workspace:*` / `file:` deps.
- [ ] `stellar-pay-sdk` published to npm; frontend/analytics depend on its published range.
- [ ] Each folder has LICENSE, README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, AGENTS.md, `.github/workflows/ci.yml`, issue templates, `.env.example`.
- [ ] `main` pushed to a backup remote; four empty GitHub repos exist.

**`scripts/split.sh`**
```bash
#!/usr/bin/env bash
set -euo pipefail
ORG="${1:?usage: split.sh <github-org>}"
SRC="$(git rev-parse --show-toplevel)"
OUT="${SRC}/../stellar-pay-split"
REPOS=(stellar-pay-core stellar-pay-api stellar-pay-frontend stellar-pay-analytics)
rm -rf "$OUT" && mkdir -p "$OUT"
for r in "${REPOS[@]}"; do
  git clone --no-local "$SRC" "$OUT/$r"
  (
    cd "$OUT/$r"
    git filter-repo --subdirectory-filter "$r"
    git remote add origin "git@github.com:${ORG}/${r}.git"
    git branch -M main
  )
  echo "prepared $OUT/$r"
done
echo "Next: add per-repo pnpm-workspace.yaml where needed, run pnpm install, verify, then push."
```

**After the script, per repo**
1. `git log --oneline | head` — only that package's history.
2. **TS repos:** add `pnpm-workspace.yaml` listing inner packages (API: `.` and `sdk`; analytics: `aggregator`, `web`; frontend: `.` and `demo`), add `.npmrc` if needed, run `pnpm install` (regenerates the lockfile, which the split doesn't carry), then the verify command. Commit the lockfile.
3. Re-tag (`v0.1.0`), remove prefixed tags if you want.
4. Push `main` and tags; confirm CI is green.
5. Repo settings: description, topics (`stellar`, `soroban`, `payments`), website, Issues + Discussions, branch protection.
6. Fix cross-repo links to final URLs. API README links to the contract repo's `deployments/` and event docs.
7. Archive the monorepo as a private backup.

Caveat: issues and PRs don't transfer; commits touching multiple folders appear in each split's history with only that folder's changes — hence one package per commit.

---

## 11. Wave readiness checklist

Check the **current** Wave rules and your dashboard before applying; mechanics change per Wave.

**Quality bar**
- [ ] Working Soroban contract on testnet, linked deployment, passing tests.
- [ ] **Live frontend demo** and a live API (a working contract plus an active frontend is what distinguishes mature projects).
- [ ] CI badges green on every repo; recent commits; tagged releases.
- [ ] Accurate READMEs with a "Status: testnet / v0.x" line and a "what's implemented / not yet" section.
- [ ] CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, templates, labels; `ROADMAP.md`.
- [ ] Short demo GIF/video in the main README.
- [ ] Clear differentiation from existing Stellar payment projects (research and state it honestly).

**Issue readiness**
- [ ] Every issue is real, unstarted, scoped, labeled, with acceptance criteria and code pointers.
- [ ] Points match the brief (core 4/3/3/2, frontend 4/3/3/2, API 4/3/3/2, analytics 4/3/3/2).
- [ ] You can review PRs quickly during the Wave window.

**Program constraints:** check limits on pending applications and on assigned issues per org per Wave. Sixteen issues across four repos may need to be **staggered** across Waves. Confirm how the program counts repos vs orgs.

---

## 12. Contributor issues: MVP boundary and seeding

Build the foundation each issue plugs into, **not the issue itself**.

### 12.1 Core

| Issue (pts) | MVP leaves | The issue delivers | Plug-in point |
|---|---|---|---|
| #1 Multi-currency (4) | One configured token per deployment; payments carry `token` | Admin-managed **token allowlist** (add/remove/list), per-token config (fee, limits), allowlist checks in create/pay; stretch: cross-asset settlement design | `is_token_allowed()` |
| #2 Webhook system (3) | Basic events with `v` field | **Re-scope (recommended):** "Versioned event schema for webhook consumers": JSON schema docs, extra fields (memo/reference, fee), decoder conformance tests/vectors, backward-compat policy. (The contract cannot call webhooks; delivery lives in the API.) | `events.rs` helpers |
| #3 Payment expiry (3) | `reclaim` safety valve; no `expires_at` on invoices | `expires_at` at creation, `pay` rejected after expiry, permissionless `expire()` sweep, `Expired` status and event, tests | `create_payment`, `pay` |
| #4 Resource-fee optimization (2) | Straightforward storage; baseline in `docs/COSTS.md` | Fewer ledger writes/bytes/reads with benchmarks showing the improvement | `storage.rs` |

### 12.2 Frontend

| Issue (pts) | MVP leaves | The issue delivers |
|---|---|---|
| #1 Recurring payment UI (4) | `RecurringPaymentForm` absent; a documented draft API only if you decide to seed it (see §2 #14) | UI + SDK stub behind a feature flag, accessible form, tests |
| #2 Payment link customization (3) | Basic link generator | Branding (logo/colors), custom fields, message, link options, preview |
| #3 Mobile responsiveness (3) | Fluid layout, desktop/tablet tested | Mobile-first pass, breakpoints, touch targets, mobile wallet deep links, device tests |
| #4 Integration documentation (2) | README quick-start | Full integration guide (React, plain JS embed), theming, error handling, troubleshooting |

### 12.3 API

| Issue (pts) | MVP leaves | The issue delivers |
|---|---|---|
| #1 GraphQL (4) | REST only | GraphQL schema/resolvers over the same services with auth, pagination, tests |
| #2 Rate limiting (3) | Naive in-memory limiter on public routes | Per-API-key limits, Redis-backed store, `RateLimit-*` headers, config, 429 contract, tests |
| #3 API documentation (3) | Generated OpenAPI + basic Swagger UI | Descriptions, examples, error catalog, authentication guide, webhook guide, SDK usage |
| #4 Security guidelines (2) | `SECURITY.md` + threat-model note | Full guide: key handling, webhook verification, SSRF, secrets, deployment hardening |

### 12.4 Analytics

| Issue (pts) | MVP leaves | The issue delivers |
|---|---|---|
| #1 Real-time updating (4) | Polling | SSE/WebSocket push from the aggregator, reconnection, tests |
| #2 Currency breakdown (3) | Single-token totals | Per-token volume/count/average breakdown, chart + table, aggregator endpoint (depends on core-1 for multi-token reality; seed after it or use fixture data) |
| #3 Export functionality (3) | None | CSV/JSON export with filters, streaming for large sets, tests |
| #4 Analytics best practices (2) | `docs/METRICS.md` definitions | Written guide: metric design, interpreting success rate, privacy, pitfalls |

### 12.5 Issue body template
```markdown
## Summary
What and why, one paragraph.

## Background
Links to files/docs; current MVP behavior; the TODO(wave: …) marker location.

## Scope
- [ ] Deliverable 1
- [ ] Deliverable 2

## Out of scope
- …

## Acceptance criteria
- [ ] Tests added and passing (`<verify command>`)
- [ ] Docs updated
- [ ] No breaking change to public API/spec (or an approved, documented one)

## How to test locally
Commands.

**Points:** N · **Labels:** wave, area:…, good first issue?
```
**Sequencing tip:** publish the most self-contained, lowest-risk issues first; keep your own work off them; make pointers precise enough to start in an hour.

---

## 13. Soroban and payments pitfalls

1. **TTL and archival.** Persistent entries expire unless extended. Extend on writes; offer `bump_ttl`. Terminal payments may be allowed to archive since the API database is the history. Handle "entry archived" errors in the API.
2. **Storage types.** `persistent` for payments, `instance` for Config (shares the contract instance TTL; make sure it is extended on every call), never `temporary` for money state.
3. **`#![no_std]`.** Use Soroban types (`String`, `Vec`, `Bytes`, `BytesN`, `Address`, `Symbol`).
4. **Auth.** `require_auth()` is the primitive. Tests with `mock_all_auths()` hide auth bugs; add non-mocked tests. Payer auth for `pay` must cover the nested token `transfer` — rely on simulation to produce the auth entries and test the full flow on testnet.
5. **Token semantics.** `i128` amounts; decimals vary per token (7 for classic assets); transfers can fail for missing trustline (classic assets) or insufficient balance. Allowlist only standard tokens.
6. **Checks-effects-interactions.** Update state before calling the token even though the host restricts reentrancy; verify current host behavior in the docs.
7. **Fees.** Resource fees are multi-dimensional; always simulate before submit; add a fee buffer; handle `tx_too_late`/sequence errors by rebuilding.
8. **Transaction building.** Sequence numbers, timebounds, and ledger-expiry for auth entries matter. A prepared XDR for the payer must have sensible timebounds; document the validity window.
9. **RPC event retention is limited** (check your provider). Persist the cursor; reconcile from contract state when behind.
10. **Testnet resets.** Contract IDs and accounts vanish; keep `deployments/testnet.json` and a one-command redeploy script.
11. **`Symbol` limits:** `symbol_short!` ≤ 9 chars; others ≤ 32.
12. **SDK drift.** `env.register(...)` vs older `register_contract`, SAC test helpers, event APIs differ by SDK version. Check the installed version.
13. **Webhook delivery is at-least-once.** Document idempotent consumption.
14. **No public relay.** The submit route validates the transaction shape. Never accept arbitrary XDR.

---

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pay` simulation fails with auth error | Payer auth entries missing for the nested transfer | Use the SDK's simulate/assemble flow; ensure the wallet signs auth entries, not only the envelope |
| `HostError: Error(Contract, #N)` | Contract error code | Map `N` to the `Error` enum; the API should translate to stable error codes |
| `Error(Storage, MissingValue)` | Entry archived or wrong id | Check TTL; restore; verify the 32-byte id encoding (hex ↔ bytes) |
| Payer has funds but transfer fails | Missing trustline for the asset | Add trustline; surface a clear UI error |
| Indexer shows no events | Wrong contract ID/filter, cursor ahead, or outside retention | Reset cursor; check `latestLedger`; run the reconciler |
| Duplicate webhooks | At-least-once delivery or indexer replay | Consumers dedupe by event `id`; ensure unique constraint on `chain_events` |
| Webhook signature mismatch | Parsed JSON re-serialized | Verify against the **raw** body |
| Amounts off by powers of ten | Decimals mishandled | Use shared helpers; never floats; test with 7-decimal tokens |
| Simulation OK, submit fails | Stale sequence, low fee, expired timebounds | Rebuild from fresh account state; add fee buffer |
| Works in monorepo, fails after split | Hidden `workspace:*`, path import, missing lockfile | §10 pre-flight; regenerate lockfile |
| Wallet can't sign | Wallet/network mismatch or unsupported feature | Check network passphrase; per-wallet support matrix in README |
| Agent loops or invents APIs | Context bloat or stale knowledge | New session, session starter, smaller task, make it read docs/source |

---

## 15. Glossary

- **Operator:** the address authorized to run a payment's lifecycle (create/settle/cancel/refund). The API's service key in hosted mode.
- **Merchant:** the payee address that receives settled funds.
- **Payer:** the customer address that funds a payment.
- **Escrow:** funds held by the contract between `pay` and `settle`.
- **Auto-settle:** `pay` settles immediately so funds are never held.
- **Reclaim:** payer's safety-valve refund after `reclaim_delay`.
- **SAC:** Stellar Asset Contract, the Soroban wrapper for classic assets and XLM.
- **SEP-41:** the Soroban token interface. **SEP-7:** payment-request URIs. **SEP-24/6:** anchor deposit/withdrawal protocols.
- **Indexer:** the API component that ingests contract events from Soroban RPC.
- **Reconciler:** a job that repairs DB state from on-chain state.
- **Idempotency key:** client-supplied key making a POST safe to retry.
- **Resource fee, TTL, archival, simulation:** see Soroban docs.
- **Wave:** the Drips Network Stellar Wave program where contributors earn points on maintainers' issues.

---

## 16. Appendices

### Appendix A — `STATUS.md` template
```markdown
# STATUS
**Updated:** YYYY-MM-DD HH:MM · **Phase:** N — name · **Task:** …

## Environment / pins
rustc … · soroban-sdk … · stellar-cli … · node … · pnpm … · TS … · @stellar/stellar-sdk … · express … · drizzle … · react … · next …
Test token: asset … SAC ID …  (testnet)

## Done
- [x] Phase 0 (commit …)

## In progress / Next / Blockers
…

## Decisions (append-only, dated)
- YYYY-MM-DD: ORM = Drizzle

## Freezes
- Contract interface frozen at: (blank until Gate 1b)
- API v1 frozen at: (blank until Gate 4)

## Deployments
- core testnet contract ID: … wasm hash: … deployed: …
- API URL: … Frontend URL: … Analytics URL: …
```

### Appendix B — `opencode.json` (verify key names in current docs)
```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "edit": "ask",
    "bash": {
      "*": "ask",
      "git status*": "allow", "git diff*": "allow", "git log*": "allow",
      "cargo test*": "allow", "cargo fmt*": "allow", "cargo clippy*": "allow",
      "pnpm lint*": "allow", "pnpm typecheck*": "allow", "pnpm test*": "allow", "pnpm build*": "allow",
      "git push*": "deny", "rm -rf*": "deny"
    }
  }
}
```
Anything with `--network mainnet` stays a human-typed command.

### Appendix C — Custom commands (`.opencode/command/*.md`; confirm directory name)

`phase.md`
```markdown
---
description: Plan the given phase without editing files
---
Read AGENTS.md, STATUS.md and the PLAYBOOK section for phase $ARGUMENTS.
Produce a numbered task list with acceptance criteria, risks, and the exact verify command. Do not edit files.
```
`verify.md`
```markdown
---
description: Run the verify command for a package and summarize
---
Run the verify command from AGENTS.md for "$ARGUMENTS". Report pass/fail per step. On failure show the minimal error and propose a fix; do not apply it until I confirm.
```
`handoff.md`
```markdown
---
description: Update STATUS.md for the next session
---
Update STATUS.md (done, in progress, next, decisions, blockers, version pins). List uncommitted changes. Do not commit.
```
`audit.md`
```markdown
---
description: Adversarial security review
---
Act as an independent auditor of "$ARGUMENTS". List ways to steal, lock, or grief funds or bypass authorization, with severity. For each, write a failing test. Do not fix anything yet.
```

### Appendix D — API `.env.example`
```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://postgres:postgres@localhost:5432/stellarpay
STELLAR_NETWORK=testnet
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org     # verify current URL
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
PAY_CONTRACT_ID=
PAY_TOKEN_CONTRACT_ID=
OPERATOR_SECRET=                  # testnet only; never commit
API_KEY_PEPPER=                   # random 32+ bytes
WEBHOOK_SECRET_ENC_KEY=           # encrypts webhook secrets at rest
INDEXER_POLL_MS=5000
PUBLIC_RATE_LIMIT_PER_MIN=60
```

### Appendix E — Webhook verification example (include in SDK README)
```ts
import { webhooks } from "stellar-pay-sdk";
// rawBody MUST be the unparsed request body string/Buffer
const event = webhooks.verify(rawBody, req.headers["stellar-pay-signature"], process.env.WH_SECRET!, { toleranceSec: 300 });
// dedupe by event.id, then handle event.type
```

### Appendix F — Gate summary

| Gate | Human checks |
|---|---|
| 1a | SPEC.md, invariants, threat model reviewed |
| 1b | Contract read line by line; tests rerun; interface frozen |
| 3 | Manual testnet pay → settle with balances checked |
| 4 | Money-path code walked; e2e script run; API v1 frozen |
| 6 | Real wallet payment through the deployed checkout |
| 8 | Security review signed off; negative e2e passes; README honesty pass |
| 9 | Four repos green; Wave checklist complete |
