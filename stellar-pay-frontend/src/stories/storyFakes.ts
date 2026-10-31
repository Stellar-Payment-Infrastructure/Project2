import type { PublicClient, PublicPayment } from 'stellar-pay-sdk';
import { StellarPayError } from 'stellar-pay-sdk';
import type { WalletAdapter } from '../wallet/WalletProvider';

export const STORY_PAYMENT_ID = 'ab'.repeat(32);

export const storyPayment = (over: Partial<PublicPayment> = {}): PublicPayment => ({
  id: STORY_PAYMENT_ID,
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
});

/** A PublicClient stand-in for stories: fixed payment, or `null` for 404, or 'loading' to never resolve. */
export function storyClient(payment: PublicPayment | null | 'loading'): PublicClient {
  return {
    getPayment: () =>
      payment === 'loading'
        ? new Promise<PublicPayment>(() => undefined)
        : payment
          ? Promise.resolve(payment)
          : Promise.reject(new StellarPayError({ code: 'NOT_FOUND', message: 'Payment not found', status: 404 })),
    buildTransaction: async () => ({ transactionXdr: 'AAAA', networkPassphrase: 'Test SDF Network ; September 2015', validUntil: '' }),
    submitTransaction: async () => ({ transactionHash: 'f'.repeat(64), status: 'paid' as const }),
  } as unknown as PublicClient;
}

export const storyWallet: WalletAdapter = {
  connect: async () => ({ address: 'GBPAYER' + 'X'.repeat(49) }),
  signTransaction: async (xdr) => xdr,
};
