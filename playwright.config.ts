import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173/',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
