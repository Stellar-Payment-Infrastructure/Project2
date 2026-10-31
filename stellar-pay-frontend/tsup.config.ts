import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  external: ['react', 'react-dom', 'stellar-pay-sdk', 'qrcode'],
  // Components use hooks; mark the bundle as a client module for React Server Components.
  banner: { js: '"use client";' },
});
