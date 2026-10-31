import { useId, useState } from 'react';

export interface PaymentLinkGeneratorProps {
  /** Hosted checkout origin, e.g. `https://pay.example.com`. */
  checkoutBaseUrl: string;
  paymentId: string;
  label?: string;
  className?: string;
}

export function checkoutUrl(checkoutBaseUrl: string, paymentId: string): string {
  return `${checkoutBaseUrl.replace(/\/+$/, '')}/pay/${encodeURIComponent(paymentId)}`;
}

/** Shows the `/pay/<id>` link with a copy button. */
export function PaymentLinkGenerator({ checkoutBaseUrl, paymentId, label = 'Payment link', className }: PaymentLinkGeneratorProps) {
  const id = useId();
  const url = checkoutUrl(checkoutBaseUrl, paymentId);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className={className}>
      <label className="sp-label" htmlFor={id}>
        {label}
      </label>
      <div className="sp-field">
        <input id={id} className="sp-input sp-mono" value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="sp-button sp-button--secondary" onClick={() => void copy()}>
          Copy
        </button>
      </div>
      <p role="status" aria-live="polite" className="sp-muted">
        {copyState === 'copied' ? 'Link copied to clipboard.' : copyState === 'failed' ? 'Could not copy. Select the link and copy it manually.' : ''}
      </p>
    </div>
  );
}
