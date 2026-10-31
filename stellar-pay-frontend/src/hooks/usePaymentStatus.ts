import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicClient, PublicPayment } from 'stellar-pay-sdk';

export const TERMINAL: readonly string[] = ['settled', 'refunded', 'cancelled', 'failed'];

export interface PaymentStatusState {
  payment: PublicPayment | null;
  loading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
  refetch: () => void;
}

export interface UsePaymentStatusOptions {
  /** Poll interval while healthy (ms). Default 3000. */
  intervalMs?: number;
  /** Upper bound for the backoff after errors (ms). Default 30000. */
  maxIntervalMs?: number;
  enabled?: boolean;
}

/**
 * Polls the public payment endpoint. Backs off exponentially on errors and
 * stops once the payment reaches a terminal state.
 */
export function usePaymentStatus(client: PublicClient, paymentId: string, opts: UsePaymentStatusOptions = {}): PaymentStatusState {
  const { intervalMs = 3000, maxIntervalMs = 30_000, enabled = true } = opts;
  const [payment, setPayment] = useState<PublicPayment | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const failures = useRef(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      let terminal = false;
      try {
        const p = await client.getPayment(paymentId);
        if (cancelled) return;
        failures.current = 0;
        setPayment(p);
        setError(null);
        setLastUpdated(new Date());
        terminal = TERMINAL.includes(p.status);
      } catch (err) {
        if (cancelled) return;
        failures.current++;
        setError(err instanceof Error ? err : new Error('Failed to load payment'));
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (cancelled || terminal) return;
      const delay = Math.min(intervalMs * 2 ** failures.current, maxIntervalMs);
      timer = setTimeout(() => void run(), delay);
    };
    void run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [client, paymentId, intervalMs, maxIntervalMs, enabled, tick]);

  return { payment, loading, error, lastUpdated, refetch };
}
