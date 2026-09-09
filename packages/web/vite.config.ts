import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { pwaOptions } from './src/pwa-config';

export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions)],
  worker: {
    format: 'es',
  },
  server: {
    port: 3000,
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});

