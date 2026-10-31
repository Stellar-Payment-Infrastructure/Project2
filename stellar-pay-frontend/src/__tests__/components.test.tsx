import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StellarPayError } from 'stellar-pay-sdk';
import { describe, expect, it, vi } from 'vitest';
import { CheckoutPage } from '../components/CheckoutPage';
import { PaymentButton } from '../components/PaymentButton';
import { checkoutUrl, PaymentLinkGenerator } from '../components/PaymentLinkGenerator';
import { PaymentStatusTracker } from '../components/PaymentStatusTracker';
import { QRCodeDisplay } from '../components/QRCodeDisplay';
import { formatAmount } from '../index';
import { walletsKitAdapter, WalletProvider } from '../wallet/WalletProvider';
import { expectNoA11yViolations, FakePublicClient, mockWallet, PAYER, PAYMENT_ID, publicPayment } from './fakes';

describe('QRCodeDisplay', () => {
  it('renders an image with a text alternative', async () => {
    const { container } = render(<QRCodeDisplay value="https://pay.example/pay/abc" label="Scan to pay" showValue />);
    const img = await screen.findByRole('img', { name: 'Scan to pay' });
    expect(img.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(screen.getByText('https://pay.example/pay/abc')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('PaymentStatusTracker', () => {
  const cases = [
    ['loading', 'Loading payment status…'],
    ['created', 'Waiting for payment.'],
    ['processing', 'Payment submitted, waiting for the network…'],
    ['paid', 'Payment received. Waiting for settlement.'],
    ['settled', 'Payment complete.'],
    ['refunded', 'Payment was refunded.'],
    ['cancelled', 'Payment was cancelled.'],
    ['failed', 'Payment failed.'],
    ['expired', 'Payment expired.'],
    ['something-new', 'Payment status is unknown.'],
  ] as const;

  it.each(cases)('announces "%s" in a polite live region', async (status, message) => {
    const { container } = render(<PaymentStatusTracker status={status} />);
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent(message);
    await expectNoA11yViolations(container);
  });

  it('conveys state with text and symbols, not color alone', () => {
    render(<PaymentStatusTracker status="paid" />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      '✓Awaiting payment (done)',
      '●Paid (current)',
      '○Settled (not started)',
    ]);
    expect(items[1]).toHaveAttribute('aria-current', 'step');
  });

  it('marks the failing step for refunds and cancellations', () => {
    const { rerender } = render(<PaymentStatusTracker status="refunded" />);
    expect(screen.getAllByRole('listitem').map((li) => li.className)).toEqual(['sp-step sp-step--done', 'sp-step sp-step--done', 'sp-step sp-step--failed']);
    rerender(<PaymentStatusTracker status="cancelled" />);
    expect(screen.getAllByRole('listitem')[0]).toHaveClass('sp-step--failed');
  });
});

describe('PaymentLinkGenerator', () => {
  it('builds the /pay/<id> link and copies it', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const { container } = render(<PaymentLinkGenerator checkoutBaseUrl="https://pay.example/" paymentId={PAYMENT_ID} />);
    const input = screen.getByLabelText('Payment link');
    expect(input).toHaveValue(`https://pay.example/pay/${PAYMENT_ID}`);
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(`https://pay.example/pay/${PAYMENT_ID}`);
    expect(await screen.findByText('Link copied to clipboard.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('explains when copying fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(<PaymentLinkGenerator checkoutBaseUrl="https://pay.example" paymentId="x" />);
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText(/Could not copy/)).toBeInTheDocument();
    expect(checkoutUrl('https://a/', 'a b')).toBe('https://a/pay/a%20b');
  });
});

describe('PaymentButton', () => {
  it('asks the merchant server for a checkout session and hands it over', async () => {
    const user = userEvent.setup();
    let resolve!: (v: { checkoutUrl: string }) => void;
    const createCheckout = vi.fn(() => new Promise<{ checkoutUrl: string }>((r) => (resolve = r)));
    const onCheckout = vi.fn();
    const { container } = render(<PaymentButton createCheckout={createCheckout} onCheckout={onCheckout} />);
    await user.click(screen.getByRole('button', { name: 'Pay with Stellar' }));
    expect(screen.getByRole('button')).toHaveTextContent('Starting checkout…');
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
    await user.click(screen.getByRole('button')); // double click is ignored
    expect(createCheckout).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ checkoutUrl: 'https://pay.example/pay/1' }));
    expect(onCheckout).toHaveBeenCalledWith({ checkoutUrl: 'https://pay.example/pay/1' });
    await expectNoA11yViolations(container);
  });

  it('shows an error state when the server call fails', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    render(<PaymentButton createCheckout={() => Promise.reject(new Error('500'))} onError={onError} />);
    await user.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not start checkout');
    expect(onError).toHaveBeenCalled();
  });
});

function renderCheckout(client: FakePublicClient, wallet = mockWallet()) {
  return render(
    <WalletProvider adapter={wallet}>
      <CheckoutPage client={client.asClient()} paymentId={PAYMENT_ID} checkoutUrl={`https://pay.example/pay/${PAYMENT_ID}`} pollIntervalMs={20} />
    </WalletProvider>,
  );
}

describe('CheckoutPage', () => {
  it('loads the payment and shows the formatted amount (no floats)', async () => {
    const client = new FakePublicClient();
    const { container } = renderCheckout(client);
    expect(screen.getByRole('status', { name: 'Loading payment' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Pay Acme Coffee' })).toBeInTheDocument();
    expect(screen.getByText('12.5')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('TESTNET');
    await expectNoA11yViolations(container);
  });

  it('runs the full keyboard flow: connect -> pay -> submitted -> paid', async () => {
    const user = userEvent.setup();
    const client = new FakePublicClient();
    const wallet = mockWallet();
    client.onSubmit = () => {
      client.payment = publicPayment({ status: 'paid' });
    };
    const { container } = renderCheckout(client, wallet);
    await screen.findByRole('button', { name: 'Connect wallet' });
    await user.tab();
    expect(screen.getByRole('button', { name: 'Connect wallet' })).toHaveFocus();
    await user.keyboard('{Enter}');
    const payButton = await screen.findByRole('button', { name: 'Pay 12.5 XLM' });
    expect(screen.getByText(/GBPAYE…XXXX/)).toBeInTheDocument();
    payButton.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Thank you, your payment was received.')).toBeInTheDocument();
    expect(wallet.signed).toEqual([`UNSIGNED:${PAYER}`]);
    expect(client.submitted).toEqual([`SIGNED(UNSIGNED:${PAYER})`]);
    expect(screen.getByRole('link', { name: 'Return to merchant' })).toHaveAttribute('href', 'https://merchant.example/thanks');
    await expectNoA11yViolations(container);
  });

  it('handles the payer cancelling in the wallet, then lets them retry', async () => {
    const user = userEvent.setup();
    const client = new FakePublicClient();
    const wallet = mockWallet({ signTransaction: () => Promise.reject(new Error('User declined')) });
    renderCheckout(client, wallet);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    await user.click(await screen.findByRole('button', { name: /^Pay / }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The transaction was not signed in your wallet.');
    expect(client.submitted).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains API failures in payer language (missing account, wrong network)', async () => {
    const user = userEvent.setup();
    const client = new FakePublicClient();
    client.failBuild = new StellarPayError({ code: 'PAYER_ACCOUNT_NOT_FOUND', message: 'x', status: 400 });
    renderCheckout(client);
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    await user.click(await screen.findByRole('button', { name: /^Pay / }));
    expect(await screen.findByRole('alert')).toHaveTextContent('does not exist on the Stellar test network');
    client.failBuild = null;
    client.failSubmit = new StellarPayError({ code: 'INVALID_TRANSACTION', message: 'x', status: 400 });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await user.click(screen.getByRole('button', { name: /^Pay / }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Make sure your wallet is on the Stellar test network');
    client.failSubmit = null;
    client.failBuild = new StellarPayError({ code: 'INSUFFICIENT_BALANCE', message: 'x', status: 409 });
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await user.click(screen.getByRole('button', { name: /^Pay / }));
    expect(await screen.findByRole('alert')).toHaveTextContent('does not have enough balance');
  });

  it('shows already-paid and invalid links correctly', async () => {
    const paid = new FakePublicClient();
    paid.payment = publicPayment({ status: 'settled' });
    const { unmount } = renderCheckout(paid);
    expect(await screen.findByText('Payment complete.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Connect wallet/ })).not.toBeInTheDocument();
    unmount();
    const missing = new FakePublicClient();
    missing.payment = null;
    renderCheckout(missing);
    expect(await screen.findByRole('alert')).toHaveTextContent('This payment link is not valid.');
  });

  it('reports wallet connection failures', async () => {
    const user = userEvent.setup();
    renderCheckout(new FakePublicClient(), mockWallet({ connect: () => Promise.reject(new Error('No wallet installed')) }));
    await user.click(await screen.findByRole('button', { name: 'Connect wallet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No wallet installed');
  });

  it('stops polling once the payment is terminal', async () => {
    const client = new FakePublicClient();
    client.payment = publicPayment({ status: 'cancelled' });
    renderCheckout(client);
    await screen.findByText('Payment was cancelled.');
    const calls = client.getCalls;
    await new Promise((r) => setTimeout(r, 120));
    expect(client.getCalls).toBe(calls);
  });

  it('keeps polling with backoff while the API is down, then recovers', async () => {
    const client = new FakePublicClient();
    client.failGet = new Error('Network request failed');
    renderCheckout(client);
    expect(await screen.findByRole('alert')).toHaveTextContent('Retrying');
    client.failGet = null;
    expect(await screen.findByRole('heading', { name: 'Pay Acme Coffee' }, { timeout: 3000 })).toBeInTheDocument();
  });
});

describe('walletsKitAdapter', () => {
  it('maps the kit API onto WalletAdapter', async () => {
    const openModal = vi.fn(async () => undefined);
    const kit = {
      getAddress: vi.fn(async () => ({ address: PAYER })),
      signTransaction: vi.fn(async (xdr: string) => ({ signedTxXdr: `signed:${xdr}` })),
      disconnect: vi.fn(async () => undefined),
    };
    const a = walletsKitAdapter(kit, { openModal });
    expect(await a.connect()).toEqual({ address: PAYER });
    expect(openModal).toHaveBeenCalled();
    expect(await a.signTransaction('X', { networkPassphrase: 'P', address: PAYER })).toBe('signed:X');
    expect(kit.signTransaction).toHaveBeenCalledWith('X', { networkPassphrase: 'P', address: PAYER });
    await a.disconnect?.();
    expect(kit.disconnect).toHaveBeenCalled();
  });
});

describe('money display', () => {
  it('formats bigint base units exactly, including huge values', () => {
    expect(formatAmount('1', 7)).toBe('0.0000001');
    expect(formatAmount(9_223_372_036_854_775_807n, 7)).toBe('922337203685.4775807');
    expect(formatAmount('99999999', 7)).toBe('9.9999999');
  });
});
