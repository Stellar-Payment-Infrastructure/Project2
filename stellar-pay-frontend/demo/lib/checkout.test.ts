import { describe, expect, it } from 'vitest';
import type { FetchLike } from 'stellar-pay-sdk';
import { createCheckout, isProductId } from './checkout';

describe('demo server checkout', () => {
  it('creates the payment server-side with the secret key and returns only a checkout URL', async () => {
    const seen: { url: string; headers: Record<string, string>; body: unknown }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      seen.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ id: 'ab'.repeat(32), status: 'created' }), { status: 201 });
    };
    const out = await createCheckout(
      'coffee',
      { STELLAR_PAY_API_KEY: 'sk_test_server_only', STELLAR_PAY_API_URL: 'https://api.example', DEMO_PUBLIC_URL: 'https://shop.example' },
      fetchImpl,
    );
    expect(out).toEqual({ checkoutUrl: `https://shop.example/pay/${'ab'.repeat(32)}`, paymentId: 'ab'.repeat(32) });
    expect(JSON.stringify(out)).not.toContain('sk_test');
    expect(seen[0]?.headers['authorization']).toBe('Bearer sk_test_server_only');
    expect(seen[0]?.body).toMatchObject({ amount: '25000000', settleMode: 'auto' });
  });

  it('refuses to run without server configuration and validates products', async () => {
    await expect(createCheckout('coffee', {})).rejects.toThrow('must be set on the server');
    expect(isProductId('coffee')).toBe(true);
    expect(isProductId('__proto__')).toBe(false);
    expect(isProductId('toString')).toBe(false);
  });
});
