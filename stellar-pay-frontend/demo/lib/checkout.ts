import { type FetchLike, StellarPay } from 'stellar-pay-sdk';

/** Demo catalog: prices in token base units (7 decimals). Never floats. */
export const PRODUCTS = {
  coffee: { name: 'Coffee', amount: 25_000_000n },
  bagel: { name: 'Bagel', amount: 40_000_000n },
} as const;
export type ProductId = keyof typeof PRODUCTS;

export function isProductId(v: unknown): v is ProductId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PRODUCTS, v);
}

/**
 * Server-side only: creates the payment with the merchant's SECRET key from
 * the environment and returns just the hosted checkout URL to the browser.
 */
export async function createCheckout(
  productId: ProductId,
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: FetchLike,
): Promise<{ checkoutUrl: string; paymentId: string }> {
  const apiKey = env['STELLAR_PAY_API_KEY'];
  const baseUrl = env['STELLAR_PAY_API_URL'];
  if (!apiKey || !baseUrl) throw new Error('STELLAR_PAY_API_KEY and STELLAR_PAY_API_URL must be set on the server');
  const sp = new StellarPay({ apiKey, baseUrl, fetch: fetchImpl });
  const product = PRODUCTS[productId];
  const site = (env['DEMO_PUBLIC_URL'] ?? 'http://localhost:3001').replace(/\/$/, '');
  const payment = await sp.payments.create({
    amount: product.amount,
    reference: `demo-${productId}-${Date.now()}`,
    metadata: { product: productId },
    settleMode: 'auto',
    successUrl: `${site}/?paid=1`,
    cancelUrl: `${site}/`,
  });
  return { checkoutUrl: `${site}/pay/${payment.id}`, paymentId: payment.id };
}
