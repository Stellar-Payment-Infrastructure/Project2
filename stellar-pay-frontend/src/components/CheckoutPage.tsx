import { formatAmount, type PublicClient, StellarPayError } from 'stellar-pay-sdk';
import { usePayment } from '../hooks/usePayment';
import { usePaymentStatus } from '../hooks/usePaymentStatus';
import { useWallet } from '../wallet/WalletProvider';
import { PaymentStatusTracker } from './PaymentStatusTracker';
import { QRCodeDisplay } from './QRCodeDisplay';

export interface CheckoutPageProps {
  client: PublicClient;
  paymentId: string;
  /** Shown as a QR code so the payer can continue on another device. */
  checkoutUrl?: string;
  /** Show the testnet banner (default true: v1 is testnet only). */
  testnet?: boolean;
  pollIntervalMs?: number;
  className?: string;
}

const STEP_LABEL: Record<string, string> = {
  building: 'Preparing transaction…',
  signing: 'Confirm in your wallet…',
  submitting: 'Submitting to the network…',
};

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Hosted checkout: load payment -> connect wallet -> sign -> submit -> track. */
export function CheckoutPage({ client, paymentId, checkoutUrl, testnet = true, pollIntervalMs, className }: CheckoutPageProps) {
  const wallet = useWallet();
  const status = usePaymentStatus(client, paymentId, { intervalMs: pollIntervalMs });
  const pay = usePayment(client, paymentId, wallet.signTransaction, wallet.address);
  const p = status.payment;

  const busy = pay.step === 'building' || pay.step === 'signing' || pay.step === 'submitting';
  const trackerStatus = !p ? (status.loading ? 'loading' : 'unknown') : p.status === 'created' && (busy || pay.step === 'submitted') ? 'processing' : p.status;

  return (
    <main className={['sp-root', className].filter(Boolean).join(' ')}>
      <section className="sp-card" aria-labelledby="sp-checkout-title" aria-busy={status.loading || undefined}>
        {testnet && (
          <p className="sp-banner" role="note">
            TESTNET: no real funds are moved
          </p>
        )}
        <h1 id="sp-checkout-title" className="sp-heading">
          {p ? `Pay ${p.merchantName}` : 'Checkout'}
        </h1>

        {status.loading && !p && (
          <div role="status" aria-label="Loading payment">
            <div className="sp-skeleton" />
            <div className="sp-skeleton" />
          </div>
        )}

        {!p && status.error && (
          <div className="sp-alert sp-alert--error" role="alert">
            {status.error instanceof StellarPayError && status.error.status === 404
              ? 'This payment link is not valid.'
              : 'Could not load this payment. Retrying…'}
          </div>
        )}

        {p && (
          <>
            <p className="sp-amount">
              {formatAmount(p.amount, p.decimals)} <span className="sp-muted">{p.tokenCode}</span>
            </p>
            <PaymentStatusTracker status={trackerStatus} />

            {p.status === 'created' && pay.step !== 'submitted' && (
              <div>
                {wallet.status !== 'connected' ? (
                  <button
                    type="button"
                    className="sp-button sp-button--primary sp-button--block"
                    onClick={() => void wallet.connect()}
                    disabled={wallet.status === 'connecting'}
                  >
                    {wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
                  </button>
                ) : (
                  <>
                    <p className="sp-muted">
                      Paying from <span className="sp-mono" title={wallet.address ?? ''}>{shorten(wallet.address ?? '')}</span>
                    </p>
                    <button
                      type="button"
                      className="sp-button sp-button--primary sp-button--block"
                      onClick={() => void pay.pay()}
                      disabled={busy}
                      aria-busy={busy || undefined}
                    >
                      {busy ? STEP_LABEL[pay.step] : `Pay ${formatAmount(p.amount, p.decimals)} ${p.tokenCode}`}
                    </button>
                  </>
                )}
                {wallet.error && (
                  <p className="sp-alert sp-alert--error" role="alert">
                    Could not connect your wallet: {wallet.error.message}
                  </p>
                )}
                {pay.error && (
                  <div className="sp-alert sp-alert--error" role="alert">
                    <p style={{ margin: 0 }}>{pay.error.message}</p>
                    <button type="button" className="sp-button sp-button--secondary" onClick={pay.reset} style={{ marginTop: 8 }}>
                      Try again
                    </button>
                  </div>
                )}
                {checkoutUrl && (
                  <details style={{ marginTop: 16 }}>
                    <summary>Pay on another device</summary>
                    <QRCodeDisplay value={checkoutUrl} label="QR code linking to this checkout page" />
                  </details>
                )}
              </div>
            )}

            {pay.step === 'submitted' && p.status === 'created' && (
              <p className="sp-alert sp-alert--success" role="status">
                Transaction submitted. Waiting for confirmation…
              </p>
            )}

            {(p.status === 'paid' || p.status === 'settled') && (
              <div className="sp-alert sp-alert--success" role="status">
                <p style={{ margin: 0 }}>Thank you, your payment was received.</p>
                {p.successUrl && (
                  <a href={p.successUrl} className="sp-button sp-button--secondary" style={{ marginTop: 8 }}>
                    Return to merchant
                  </a>
                )}
              </div>
            )}

            {(p.status === 'cancelled' || p.status === 'refunded') && p.cancelUrl && (
              <a href={p.cancelUrl} className="sp-button sp-button--secondary">
                Return to merchant
              </a>
            )}

            {status.lastUpdated && (
              <p className="sp-muted">
                <span>Last updated </span>
                <time dateTime={status.lastUpdated.toISOString()}>{status.lastUpdated.toLocaleTimeString()}</time>
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
