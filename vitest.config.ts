import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['src/core/pdf/repliesInterop.test.ts', 'jsdom'],
      ['src/core/pdf/**', 'node'],
      ['src/core/columns/**', 'node'],
      ['src/core/markup/**', 'node'],
      ['src/core/measurements/**', 'node'],
      ['src/core/pages/**', 'node'],
      ['src/core/perf/**', 'node'],
      ['src/core/render/**', 'node'],
      ['src/core/search/**', 'node'],
      ['src/core/sets/**', 'node'],
      ['src/core/help/**', 'node'],
      ['src/core/links/**', 'node'],
      ['src/store/history/**', 'node'],
      ['src/utils/coordinates.test.ts', 'node'],
      ['src/utils/dateUtils.test.ts', 'node'],
      ['src/utils/dragInteraction.test.ts', 'node'],
      ['src/utils/markupFilterSort.test.ts', 'node'],
    ],
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'tests/e2e/**'],
  },
});
