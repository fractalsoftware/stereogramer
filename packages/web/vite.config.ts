import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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

