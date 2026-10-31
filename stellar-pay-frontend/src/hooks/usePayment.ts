import { useCallback, useRef, useState } from 'react';
import { type PublicClient, StellarPayError } from 'stellar-pay-sdk';

export type PayStep = 'idle' | 'building' | 'signing' | 'submitting' | 'submitted' | 'error';

export type PayErrorCode =
  | 'NOT_CONNECTED'
  | 'WALLET_REJECTED'
  | 'BUILD_FAILED'
  | 'SUBMIT_FAILED'
  | 'NETWORK_ERROR';

export class PayError extends Error {
  constructor(readonly code: PayErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'PayError';
  }
}

export interface PayState {
  step: PayStep;
  error: PayError | null;
  txHash: string | null;
}

/** Turns API/wallet failures into messages a payer can act on. */
export function describeApiError(err: unknown): string {
  if (err instanceof StellarPayError) {
    switch (err.code) {
      case 'PAYER_ACCOUNT_NOT_FOUND':
        return 'Your wallet account does not exist on the Stellar test network yet. Fund it first.';
      case 'PAYMENT_NOT_PAYABLE':
        return 'This payment can no longer be paid.';
      case 'INVALID_TRANSACTION':
        return 'The signed transaction was rejected. Make sure your wallet is on the Stellar test network.';
      case 'INSUFFICIENT_BALANCE':
        return 'Your wallet does not have enough balance for this payment.';
      case 'TRUSTLINE_MISSING':
        return 'Your wallet has no trustline for this asset. Add the asset to your wallet first.';
      case 'BALANCE_DEAUTHORIZED':
        return 'The asset issuer has frozen this balance, so it cannot be used.';
      case 'SIMULATION_FAILED':
        return 'The payment could not be prepared. Check that you have enough balance and a trustline for this asset.';
      case 'RATE_LIMITED':
        return 'Too many requests. Please wait a moment and try again.';
      case 'RPC_UNAVAILABLE':
      case 'CHAIN_TIMEOUT':
        return 'The Stellar network is not responding. Your payment may still complete; check the status below.';
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}

/**
 * Pay flow: build (API) -> sign (wallet) -> submit (API). Explicit steps and
 * error codes; a second `pay()` while one is in flight is ignored.
 */
export function usePayment(
  client: PublicClient,
  paymentId: string,
  sign: (xdr: string, networkPassphrase: string) => Promise<string>,
  payer: string | null,
) {
  const [state, setState] = useState<PayState>({ step: 'idle', error: null, txHash: null });
  const busy = useRef(false);

  const pay = useCallback(async () => {
    if (busy.current) return;
    if (!payer) {
      setState({ step: 'error', error: new PayError('NOT_CONNECTED', 'Connect a wallet first.'), txHash: null });
      return;
    }
    busy.current = true;
    try {
      setState({ step: 'building', error: null, txHash: null });
      let built;
      try {
        built = await client.buildTransaction(paymentId, payer);
      } catch (err) {
        throw new PayError(err instanceof StellarPayError ? 'BUILD_FAILED' : 'NETWORK_ERROR', describeApiError(err), err);
      }
      setState({ step: 'signing', error: null, txHash: null });
      let signed: string;
      try {
        signed = await sign(built.transactionXdr, built.networkPassphrase);
      } catch (err) {
        throw new PayError('WALLET_REJECTED', 'The transaction was not signed in your wallet.', err);
      }
      setState({ step: 'submitting', error: null, txHash: null });
      try {
        const res = await client.submitTransaction(paymentId, signed);
        setState({ step: 'submitted', error: null, txHash: res.transactionHash });
      } catch (err) {
        throw new PayError(err instanceof StellarPayError ? 'SUBMIT_FAILED' : 'NETWORK_ERROR', describeApiError(err), err);
      }
    } catch (err) {
      const e = err instanceof PayError ? err : new PayError('NETWORK_ERROR', describeApiError(err), err);
      setState({ step: 'error', error: e, txHash: null });
    } finally {
      busy.current = false;
    }
  }, [client, paymentId, sign, payer]);

  const reset = useCallback(() => setState({ step: 'idle', error: null, txHash: null }), []);
  return { ...state, pay, reset };
}
