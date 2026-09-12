import { defineConfig } from '@playwright/test';
const externalURL = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, workers: 1,
  use: { baseURL: externalURL || 'http://127.0.0.1:3000', channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', viewport: { width: 1440, height: 960 }, screenshot: 'only-on-failure' },
  reporter: 'list',
  webServer: externalURL ? undefined : { command: 'npm run dev', url: 'http://127.0.0.1:3000', reuseExistingServer: !process.env.CI, timeout: 120000 },
});
