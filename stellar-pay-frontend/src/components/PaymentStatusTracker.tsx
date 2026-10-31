export type TrackerStatus = 'loading' | 'unknown' | 'pending' | 'created' | 'processing' | 'paid' | 'settled' | 'refunded' | 'cancelled' | 'failed' | 'expired';

const STEPS = [
  { key: 'created', label: 'Awaiting payment' },
  { key: 'paid', label: 'Paid' },
  { key: 'settled', label: 'Settled' },
] as const;

const RANK: Record<string, number> = { pending: 0, created: 0, processing: 0, paid: 1, settled: 2 };

const MESSAGES: Record<TrackerStatus, string> = {
  loading: 'Loading payment status…',
  unknown: 'Payment status is unknown.',
  pending: 'Payment is being set up…',
  created: 'Waiting for payment.',
  processing: 'Payment submitted, waiting for the network…',
  paid: 'Payment received. Waiting for settlement.',
  settled: 'Payment complete.',
  refunded: 'Payment was refunded.',
  cancelled: 'Payment was cancelled.',
  failed: 'Payment failed.',
  expired: 'Payment expired.',
};

export interface PaymentStatusTrackerProps {
  status: TrackerStatus | string;
  className?: string;
}

/**
 * Visual timeline plus a polite live region, so screen readers hear status
 * changes. Each step shows a symbol and text, never color alone.
 */
export function PaymentStatusTracker({ status, className }: PaymentStatusTrackerProps) {
  const s: TrackerStatus = (status in MESSAGES ? status : 'unknown') as TrackerStatus;
  // Refunds happen after payment (the final step fails); the others end before it.
  const failedAt = s === 'refunded' ? 2 : s === 'cancelled' || s === 'failed' || s === 'expired' ? 0 : -1;
  const rank = RANK[s] ?? -1;

  const stepState = (i: number): 'done' | 'current' | 'todo' | 'failed' => {
    if (failedAt >= 0) return i === failedAt ? 'failed' : i < failedAt ? 'done' : 'todo';
    if (s === 'settled' || i < rank) return 'done';
    return i === rank ? 'current' : 'todo';
  };

  return (
    <div className={className}>
      <ol className="sp-steps" aria-label="Payment progress">
        {STEPS.map((step, i) => {
          const state = stepState(i);
          const icon = state === 'done' ? '✓' : state === 'failed' ? '✕' : state === 'current' ? '●' : '○';
          const text = state === 'failed' ? MESSAGES[s].replace(/\.$/, '') : step.label;
          return (
            <li key={step.key} className={`sp-step sp-step--${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="sp-step__icon" aria-hidden="true">
                {icon}
              </span>
              {text}
              <span className="sp-visually-hidden">{` (${state === 'todo' ? 'not started' : state})`}</span>
            </li>
          );
        })}
      </ol>
      <p role="status" aria-live="polite" className="sp-muted" data-status={s}>
        {MESSAGES[s]}
      </p>
    </div>
  );
}
