'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckoutPage, WalletProvider } from 'stellar-pay-frontend';
import { PublicClient } from 'stellar-pay-sdk';
import { createDemoWalletAdapter } from '../../../lib/wallet';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export function CheckoutClient({ paymentId }: { paymentId: string }) {
  const client = useMemo(() => new PublicClient({ baseUrl: API_BASE_URL }), []);
  const adapter = useMemo(() => createDemoWalletAdapter(), []);
  // The QR code links to this page; read the URL after mount (SSR-safe).
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => setUrl(window.location.href), []);
  return (
    <WalletProvider adapter={adapter}>
      <CheckoutPage client={client} paymentId={paymentId} checkoutUrl={url} />
    </WalletProvider>
  );
}
