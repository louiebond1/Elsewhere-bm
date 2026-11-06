import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against a running server in fixture mode (npm run build && npm run start, plus npm run worker),
 * pointed at a disposable database. Tests load scenarios through the demo API, so they mutate the shared demo.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'off', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' }, grep: /@phone/ },
  ],
});
