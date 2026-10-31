# AGENTS.md — stellar-pay-frontend

## Package: stellar-pay-frontend

React component library for Stellar payments checkout.

### Verify Command

```bash
pnpm install --frozen-lockfile && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
```

### Key Directories

- `src/components/` — PaymentButton, PaymentLinkGenerator, QRCodeDisplay, PaymentStatusTracker, CheckoutPage
- `src/hooks/` — usePayment, usePaymentStatus, useWallet
- `src/wallet/WalletProvider.tsx` — Stellar Wallets Kit integration
- `src/onramp/OnRampProvider.tsx` — fiat on-ramp interface (stub)
- `src/theme.css` — CSS variables (`--sp-*`)
- `src/index.ts` — public exports

### Components

| Component | Purpose |
|-----------|---------|
| `PaymentButton` | Merchant-side: creates checkout via server endpoint |
| `PaymentLinkGenerator` | Copy `/pay/<id>` link |
| `QRCodeDisplay` | QR of checkout URL (uses `qrcode` lib) |
| `PaymentStatusTracker` | Visual timeline: Created → Paid → Settled |
| `CheckoutPage` | Hosted checkout: connect → build → sign → submit → track |

### Hooks

- `useWallet` — connect/disconnect, signTransaction
- `usePayment(publicClient, paymentId)` — build/sign/submit flow
- `usePaymentStatus(publicClient, paymentId)` — polls public endpoint

### Theming

CSS variables in `theme.css`: `--sp-color-*`, `--sp-space-*`, `--sp-font-*`, `--sp-radius-*`, `--sp-shadow-*`, `--sp-transition-*`. Dark mode via `[data-sp-theme="dark"]`.

### Rules

- No `window` access at import time (SSR-safe)
- Money formatting: `bigint` + decimals, never floats
- Accessibility: WCAG 2.1 AA, axe in tests, live regions for status
- Peer deps: `react`, `react-dom`, `stellar-pay-sdk`
- Build: `tsup` (ESM + CJS + types), `"use client"` banner

### Demo

`demo/` — Next.js App Router with hosted checkout at `/pay/[id]` and demo storefront.