import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'node scripts/serve.mjs --port 4173',
    port: 4173,
    reuseExistingServer: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
