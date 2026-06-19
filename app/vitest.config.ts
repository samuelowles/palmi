import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  define: {
    // Expo polyfill for test environment — the real config.ts uses __DEV__
    __DEV__: JSON.stringify(false),
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
