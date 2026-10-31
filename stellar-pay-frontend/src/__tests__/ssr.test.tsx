// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as lib from '../index';
import { FakePublicClient, mockWallet, PAYMENT_ID } from './fakes';

describe('SSR safety', () => {
  it('imports and server-renders every component without window/document', () => {
    expect(typeof globalThis.window).toBe('undefined');
    const client = new FakePublicClient().asClient();
    const html = renderToString(
      <lib.WalletProvider adapter={mockWallet()}>
        <lib.CheckoutPage client={client} paymentId={PAYMENT_ID} />
        <lib.PaymentStatusTracker status="paid" />
        <lib.PaymentLinkGenerator checkoutBaseUrl="https://pay.example" paymentId={PAYMENT_ID} />
        <lib.PaymentButton createCheckout={async () => ({ checkoutUrl: 'https://pay.example' })} />
        <lib.QRCodeDisplay value="https://pay.example" />
      </lib.WalletProvider>,
    );
    expect(html).toContain('Checkout');
    expect(html).toContain('Pay with Stellar');
  });
});
