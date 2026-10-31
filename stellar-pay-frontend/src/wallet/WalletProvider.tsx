import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Minimal wallet interface the components need. Implement it for any wallet,
 * or wrap Stellar Wallets Kit with `walletsKitAdapter`.
 */
export interface WalletAdapter {
  /** Opens the wallet's connect flow; resolves with the selected account. */
  connect(): Promise<{ address: string }>;
  /** Signs a transaction envelope (base64 XDR) and returns the signed XDR. */
  signTransaction(xdr: string, opts: { networkPassphrase: string; address: string }): Promise<string>;
  disconnect?(): Promise<void> | void;
}

/** The subset of the Stellar Wallets Kit (v2) API used by `walletsKitAdapter`. */
export interface WalletsKitLike {
  getAddress(): Promise<{ address: string }>;
  signTransaction(xdr: string, opts: { networkPassphrase: string; address: string }): Promise<{ signedTxXdr: string }>;
  disconnect?(): Promise<void>;
}

/**
 * Adapts Stellar Wallets Kit to `WalletAdapter`. Pass `openModal` to show the
 * kit's wallet picker before reading the address (how you open it depends on
 * your kit setup), e.g. `walletsKitAdapter(StellarWalletsKit, { openModal })`.
 */
export function walletsKitAdapter(kit: WalletsKitLike, opts: { openModal?: () => Promise<unknown> } = {}): WalletAdapter {
  return {
    async connect() {
      if (opts.openModal) await opts.openModal();
      return kit.getAddress();
    },
    async signTransaction(xdr, o) {
      const { signedTxXdr } = await kit.signTransaction(xdr, o);
      return signedTxXdr;
    },
    async disconnect() {
      await kit.disconnect?.();
    },
  };
}

export type WalletStatus = 'disconnected' | 'connecting' | 'connected';

export interface WalletContextValue {
  status: WalletStatus;
  address: string | null;
  error: Error | null;
  connect: () => Promise<string | null>;
  disconnect: () => Promise<void>;
  signTransaction: (xdr: string, networkPassphrase: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

/**
 * Holds the connected account. SSR-safe: nothing touches `window` until the
 * user acts. The address is kept in memory only (never persisted).
 */
export function WalletProvider({ adapter, children }: { adapter: WalletAdapter; children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('disconnected');
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const connect = useCallback(async () => {
    setStatus('connecting');
    setError(null);
    try {
      const res = await adapter.connect();
      setAddress(res.address);
      setStatus('connected');
      return res.address;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Could not connect wallet'));
      setStatus('disconnected');
      return null;
    }
  }, [adapter]);

  const disconnect = useCallback(async () => {
    await adapter.disconnect?.();
    setAddress(null);
    setStatus('disconnected');
  }, [adapter]);

  const signTransaction = useCallback(
    async (xdr: string, networkPassphrase: string) => {
      if (!address) throw new Error('No wallet connected');
      return adapter.signTransaction(xdr, { networkPassphrase, address });
    },
    [adapter, address],
  );

  const value = useMemo(
    () => ({ status, address, error, connect, disconnect, signTransaction }),
    [status, address, error, connect, disconnect, signTransaction],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
  return ctx;
}
