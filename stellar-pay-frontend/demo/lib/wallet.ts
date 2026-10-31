'use client';

import type { WalletAdapter } from 'stellar-pay-frontend';

export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

declare global {
  interface Window {
    /** Browser-test hook: Playwright injects a mock wallet here. */
    __STELLAR_PAY_TEST_WALLET__?: WalletAdapter;
  }
}

type Kit = typeof import('@creit.tech/stellar-wallets-kit/sdk').StellarWalletsKit;

/**
 * Real wallets via Stellar Wallets Kit, loaded lazily on first connect so the
 * page stays SSR-safe and light. The kit only runs in the payer's browser and
 * never sees any merchant secret.
 */
export function createDemoWalletAdapter(): WalletAdapter {
  let kitPromise: Promise<Kit> | null = null;
  const kit = () => {
    kitPromise ??= (async () => {
      const [{ StellarWalletsKit }, { defaultModules }, { Networks }] = await Promise.all([
        import('@creit.tech/stellar-wallets-kit/sdk'),
        import('@creit.tech/stellar-wallets-kit/modules/utils'),
        import('@creit.tech/stellar-wallets-kit/types'),
      ]);
      StellarWalletsKit.init({ modules: defaultModules(), network: Networks.TESTNET });
      return StellarWalletsKit;
    })();
    return kitPromise;
  };

  const testWallet = () => (typeof window !== 'undefined' ? window.__STELLAR_PAY_TEST_WALLET__ : undefined);

  return {
    async connect() {
      const mock = testWallet();
      if (mock) return mock.connect();
      const k = await kit();
      const { address } = await k.authModal();
      const { networkPassphrase } = await k.getNetwork();
      if (networkPassphrase !== TESTNET_PASSPHRASE) {
        throw new Error('Your wallet is not on the Stellar test network. Switch it to Testnet and try again.');
      }
      return { address };
    },
    async signTransaction(xdr, opts) {
      const mock = testWallet();
      if (mock) return mock.signTransaction(xdr, opts);
      const k = await kit();
      const { signedTxXdr } = await k.signTransaction(xdr, opts);
      return signedTxXdr;
    },
    async disconnect() {
      const mock = testWallet();
      if (mock) {
        await mock.disconnect?.();
        return;
      }
      await (await kit()).disconnect();
    },
  };
}
