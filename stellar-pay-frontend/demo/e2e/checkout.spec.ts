import { expect, type Page, test } from '@playwright/test';

const ID = 'ab'.repeat(32);
const PAYER = 'GBPAYER' + 'X'.repeat(49);

function payment(status: string) {
  return {
    id: ID, status, amount: '25000000', token: 'CTOKEN', tokenCode: 'XLM', decimals: 7,
    merchantName: 'Demo coffee shop', successUrl: 'https://shop.example/?paid=1', cancelUrl: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  };
}

// The real API answers checkout origins with CORS headers; so must the mock.
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };

/** Mocks the public API and injects a mock wallet. */
async function setup(page: Page, opts: { rejectSign?: boolean } = {}) {
  let status = 'created';
  await page.route('**/v1/public/**', (r) => (r.request().method() === 'OPTIONS' ? r.fulfill({ status: 204, headers: cors }) : r.fallback()));
  await page.route('**/v1/public/payments/*/transaction', (r) =>
    r.fulfill({ headers: cors, json: { transactionXdr: 'UNSIGNED', networkPassphrase: 'Test SDF Network ; September 2015', validUntil: '' } }),
  );
  await page.route('**/v1/public/payments/*/submit', (r) => {
    status = 'paid';
    return r.fulfill({ headers: cors, json: { transactionHash: 'f'.repeat(64), status: 'paid' } });
  });
  await page.route(`**/v1/public/payments/${ID}`, (r) => r.fulfill({ headers: cors, json: payment(status) }));
  await page.addInitScript(
    ({ payer, reject }) => {
      window.__STELLAR_PAY_TEST_WALLET__ = {
        connect: async () => ({ address: payer }),
        signTransaction: async (xdr: string) => {
          if (reject) throw new Error('User declined');
          return `SIGNED:${xdr}`;
        },
      };
    },
    { payer: PAYER, reject: !!opts.rejectSign },
  );
}

test('payer completes checkout with the keyboard', async ({ page }) => {
  await setup(page);
  await page.goto(`/pay/${ID}`);
  await expect(page.getByRole('heading', { name: 'Pay Demo coffee shop' })).toBeVisible();
  await expect(page.getByText('TESTNET')).toBeVisible();
  await page.getByRole('button', { name: 'Connect wallet' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Pay 2.5 XLM' }).click();
  await expect(page.getByText('Thank you, your payment was received.')).toBeVisible();
});

test('payer cancels in the wallet', async ({ page }) => {
  await setup(page, { rejectSign: true });
  await page.goto(`/pay/${ID}`);
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByRole('button', { name: 'Pay 2.5 XLM' }).click();
  // Next.js adds its own role=alert route announcer, so filter by text.
  await expect(page.getByRole('alert').filter({ hasText: 'not signed in your wallet' })).toBeVisible();
});
