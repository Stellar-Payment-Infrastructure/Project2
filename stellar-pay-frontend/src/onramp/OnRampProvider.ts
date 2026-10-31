/**
 * Fiat on-ramp integration point. INTERFACE ONLY: no provider is implemented
 * in v1. See docs/ONRAMP.md for how a SEP-24 / SEP-6 anchor would plug in.
 */
export interface OnRampQuoteRequest {
  /** Stellar account that should receive the funds. */
  account: string;
  /** Asset code the payer needs, e.g. "USDC". */
  assetCode: string;
  /** Amount in token base units, decimal string. */
  amount: string;
}

export interface OnRampSession {
  /** URL of the provider's interactive flow (SEP-24) to open in a new window. */
  url: string;
  /** Provider transaction id, for status polling. */
  id: string;
}

export type OnRampStatus = 'pending_user' | 'pending_anchor' | 'completed' | 'error' | 'expired';

export interface OnRampProvider {
  readonly name: string;
  /** Assets this provider can deliver on testnet. */
  supportedAssets(): Promise<string[]>;
  /** Starts an interactive deposit for the payer. */
  startDeposit(req: OnRampQuoteRequest): Promise<OnRampSession>;
  getStatus(id: string): Promise<OnRampStatus>;
}
