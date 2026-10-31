import axe from 'axe-core';
import { expect } from 'vitest';
import { type PublicClient, type PublicPayment, StellarPayError } from 'stellar-pay-sdk';
import type { WalletAdapter } from '../wallet/WalletProvider';

export const PAYMENT_ID = 'ab'.repeat(32);

export function publicPayment(over: Partial<PublicPayment> = {}): PublicPayment {
  return {
    id: PAYMENT_ID,
    status: 'created',
    amount: '125000000',
    token: 'CTOKEN',
    tokenCode: 'XLM',
    decimals: 7,
    merchantName: 'Acme Coffee',
    successUrl: 'https://merchant.example/thanks',
    cancelUrl: 'https://merchant.example/cancel',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

/** Scriptable stand-in for the SDK's PublicClient. */
export class FakePublicClient {
  payment: PublicPayment | null = publicPayment();
  getCalls = 0;
  failGet: Error | null = null;
  failBuild: Error | null = null;
  failSubmit: Error | null = null;
  submitted: string[] = [];
  onSubmit: (() => void) | null = null;

  async getPayment(_id: string): Promise<PublicPayment> {
    this.getCalls++;
    if (this.failGet) throw this.failGet;
    if (!this.payment) throw new StellarPayError({ code: 'NOT_FOUND', message: 'Payment not found', status: 404 });
    return { ...this.payment };
  }

  async buildTransaction(_id: string, payer: string) {
    if (this.failBuild) throw this.failBuild;
    return { transactionXdr: `UNSIGNED:${payer}`, networkPassphrase: 'Test SDF Network ; September 2015', validUntil: '2026-01-01T00:05:00Z' };
  }

  async submitTransaction(_id: string, signedXdr: string) {
    if (this.failSubmit) throw this.failSubmit;
    this.submitted.push(signedXdr);
    this.onSubmit?.();
    return { transactionHash: 'f'.repeat(64), status: 'paid' as const };
  }

  asClient(): PublicClient {
    return this as unknown as PublicClient;
  }
}

export const PAYER = 'GBPAYER' + 'X'.repeat(49);

/** Mock wallet: no extension needed. */
export function mockWallet(over: Partial<WalletAdapter> = {}): WalletAdapter & { signed: string[] } {
  const signed: string[] = [];
  return {
    signed,
    connect: async () => ({ address: PAYER }),
    signTransaction: async (xdr) => {
      signed.push(xdr);
      return `SIGNED(${xdr})`;
    },
    ...over,
  };
}

/** Runs axe-core on the rendered DOM. Color contrast needs layout, which jsdom lacks. */
export async function expectNoA11yViolations(container: Element) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.html).join(' | ')})`)).toEqual([]);
}
