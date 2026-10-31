import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import 'stellar-pay-frontend/theme.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stellar Pay demo (testnet)',
  description: 'Hosted checkout and demo storefront for Stellar Pay on the Stellar test network',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
