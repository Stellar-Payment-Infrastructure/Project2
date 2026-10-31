import { defineConfig } from '@playwright/test';

/**
 * Browser e2e for the hosted checkout with a mocked wallet (injected through
 * the window test hook) and the public API mocked by route interception, so
 * it runs without testnet access:
 *   pnpm build && pnpm exec playwright install chromium && pnpm e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3101' },
  webServer: {
    command: 'pnpm exec next start -p 3101',
    url: 'http://localhost:3101',
    reuseExistingServer: false,
  },
});
