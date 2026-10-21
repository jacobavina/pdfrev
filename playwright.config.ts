import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/globalSetup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:1421',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      // Escritorio realista (ADR-0017): la app nativa abre maximizada; 1280x720 se prueba aparte
      // en el test de regresión de desborde de la barra de herramientas.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 1421 --strictPort',
    url: 'http://localhost:1421',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
