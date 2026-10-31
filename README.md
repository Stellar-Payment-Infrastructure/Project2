# Stellar Payment Infrastructure

A four-package payments suite on Stellar/Soroban, built in a single monorepo.

## Packages

| Package | Description |
|---------|-------------|
| `stellar-pay-core` | Soroban contract: payment state machine, escrow, settlement |
| `stellar-pay-api` | Express REST API: auth, payments, webhooks, indexer, SDK |
| `stellar-pay-frontend` | React components: PaymentButton, CheckoutPage, QRCode, StatusTracker |
| `stellar-pay-analytics` | Aggregator service + React dashboard |

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r run build

# Run tests
pnpm -r run test

# Start development (requires Postgres + Stellar testnet)
docker-compose up -d postgres
pnpm --filter stellar-pay-api run dev
pnpm --filter stellar-pay-frontend run dev
```

## Contract (stellar-pay-core)

The contract implements a payment state machine:

```
Created → Paid → Settled
           ↓
        Refunded
           ↓
       Cancelled
```

### Functions

- `initialize(admin, token, fee_bps, fee_recipient, reclaim_delay)`
- `create_payment(operator, merchant, payment_id, amount, reference, settle_mode)`
- `pay(payer, payment_id)` — auto-settles if `settle_mode == Auto`
- `settle(payment_id)` — operator only
- `cancel(payment_id)` — operator only, only in Created state
- `refund(payment_id)` — operator only, only in Paid state
- `reclaim(payment_id)` — payer only, after reclaim_delay
- `get_payment(payment_id)` — read-only
- `get_config()` — read-only
- `set_fee(fee_bps, fee_recipient)` — admin
- `set_paused(paused)` — admin
- `propose_admin(new_admin)` / `accept_admin()` — admin transfer
- `bump_ttl(payment_id)` — extend storage TTL

### Invariants

1. Funds only move to: merchant, fee_recipient, or payer
2. settle/refund happen at most once per payment
3. Contract token balance == sum of amounts for payments in Paid state
4. fee + merchant_amount == amount (checked math)
5. Pausing never traps funds: settle/refund/reclaim still work
6. Admin cannot move escrowed funds
7. Fee is snapshotted at pay time
8. Operator cannot redirect funds to arbitrary address

## API (stellar-pay-api)

### Auth

- **Secret API Key** (`Authorization: Bearer sk_test_...`): merchant server operations
- **Public endpoints**: authorized by payment ID, rate-limited

### Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /v1/payments` | secret | Create payment |
| `GET /v1/payments/:id` | secret | Get payment |
| `GET /v1/payments` | secret | List payments |
| `POST /v1/payments/:id/cancel` | secret | Cancel payment |
| `POST /v1/payments/:id/settle` | secret | Settle payment |
| `POST /v1/payments/:id/refund` | secret | Refund payment |
| `GET /v1/public/payments/:id` | public | Minimal checkout view |
| `POST /v1/public/payments/:id/transaction` | public | Build unsigned pay tx |
| `POST /v1/public/payments/:id/submit` | public | Submit signed pay tx |
| `POST/GET/DELETE /v1/webhook-endpoints` | secret | Manage webhooks |
| `GET /v1/health` | public | Health check |
| `GET /v1/openapi.json` | public | OpenAPI spec |
| `GET /docs` | public | Swagger UI |

### Webhooks

- Events: `payment.created`, `payment.paid`, `payment.settled`, `payment.refunded`, `payment.cancelled`
- HMAC-SHA256 signatures with timestamp
- Exponential backoff retry (max 8 attempts over ~24h)
- SSRF protection on delivery URLs

## Frontend (stellar-pay-frontend)

### Components

- `PaymentButton` — merchant-side checkout trigger
- `PaymentLinkGenerator` — copy payment link
- `QRCodeDisplay` — QR code for checkout URL
- `PaymentStatusTracker` — visual status timeline
- `CheckoutPage` — hosted checkout (connect wallet → sign → submit → track)
- `WalletProvider` / `useWallet` — Stellar Wallets Kit integration
- `usePayment` / `usePaymentStatus` — payment flow hooks

### Theming

CSS variables (`--sp-*`) for colors, spacing, typography, shadows, transitions.

## Analytics (stellar-pay-analytics)

### Aggregator

- Ingests payments from API via `updated_since` cursor
- Stores in own PostgreSQL database
- Serves `/stats/volume`, `/stats/success-rate`, `/stats/average-size`, `/stats/payments`
- Bearer token auth

### Dashboard

- Date range filter, merchant filter
- Volume chart, success rate, average size
- Payments table with pagination
- Polling refresh (30s), "last updated" timestamp

## Development

### Prerequisites

- Rust 1.81+
- Node 20+
- pnpm 9+
- Docker (Postgres)
- Stellar CLI (for contract deployment)

### Monorepo Structure

```
stellar-pay-suite/
├── scripts/
│   ├── verify-all.sh
│   ├── sync-bindings.sh
│   └── sync-sdk.sh
├── stellar-pay-core/
│   ├── contracts/payments/
│   └── deployments/testnet.json
├── stellar-pay-api/
│   ├── src/
│   ├── sdk/
│   ├── openapi/
│   └── docker-compose.yml
├── stellar-pay-frontend/
│   ├── src/
│   └── demo/
└── stellar-pay-analytics/
    ├── aggregator/
    ├── web/
    └── docs/METRICS.md
```

## Deployment

Each package is independently deployable:
- Contract: `stellar contract deploy` → testnet
- API: Docker → Fly/Render/Railway + Postgres
- Frontend: Vercel/Netlify (static export)
- Analytics: Docker → same as API

## License

MIT