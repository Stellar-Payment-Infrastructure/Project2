'use client';

import { formatAmount, PaymentButton } from 'stellar-pay-frontend';

const PRODUCTS = [
  { id: 'coffee', name: 'Coffee', amount: '25000000' },
  { id: 'bagel', name: 'Bagel', amount: '40000000' },
] as const;

async function startCheckout(productId: string) {
  // Our own server route creates the payment with the secret key.
  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ productId }),
  });
  if (!res.ok) throw new Error(`checkout failed (${res.status})`);
  return (await res.json()) as { checkoutUrl: string };
}

export function Storefront() {
  return (
    <main className="sp-root">
      <p className="sp-banner" role="note">
        TESTNET DEMO: no real funds are moved
      </p>
      <h1 style={{ textAlign: 'center' }}>Demo coffee shop</h1>
      <div className="demo-grid">
        {PRODUCTS.map((p) => (
          <section key={p.id} className="sp-card" aria-labelledby={`p-${p.id}`}>
            <h2 id={`p-${p.id}`} className="sp-heading">
              {p.name}
            </h2>
            <p className="sp-amount">{formatAmount(p.amount, 7)} XLM</p>
            <PaymentButton createCheckout={() => startCheckout(p.id)}>Buy {p.name}</PaymentButton>
          </section>
        ))}
      </div>
    </main>
  );
}
