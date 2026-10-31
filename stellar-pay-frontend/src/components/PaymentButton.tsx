import { type ReactNode, useState } from 'react';

export interface CheckoutSession {
  /** Hosted checkout URL returned by YOUR server (from the API's `checkoutUrl`). */
  checkoutUrl: string;
}

export interface PaymentButtonProps {
  /**
   * Calls YOUR server endpoint, which creates the payment with the secret
   * API key (server-side, e.g. with `stellar-pay-sdk`) and returns its
   * `checkoutUrl`. The browser never sees an API key.
   */
  createCheckout: () => Promise<CheckoutSession>;
  /** Defaults to `window.location.assign(url)`. */
  onCheckout?: (session: CheckoutSession) => void;
  onError?: (error: Error) => void;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Merchant-side "Pay with Stellar" button. */
export function PaymentButton({ createCheckout, onCheckout, onError, children = 'Pay with Stellar', disabled, className }: PaymentButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  const click = async () => {
    if (state === 'loading') return;
    setState('loading');
    try {
      const session = await createCheckout();
      setState('idle');
      if (onCheckout) onCheckout(session);
      else window.location.assign(session.checkoutUrl);
    } catch (err) {
      setState('error');
      onError?.(err instanceof Error ? err : new Error('Could not start checkout'));
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        className="sp-button sp-button--primary"
        onClick={() => void click()}
        disabled={disabled}
        aria-disabled={state === 'loading' || undefined}
        aria-busy={state === 'loading' || undefined}
      >
        {state === 'loading' ? 'Starting checkout…' : children}
      </button>
      {state === 'error' && (
        <p className="sp-alert sp-alert--error" role="alert">
          Could not start checkout. Please try again.
        </p>
      )}
    </div>
  );
}
