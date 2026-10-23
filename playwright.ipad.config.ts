import { defineConfig, devices } from '@playwright/test';
const port = process.env.PLAYWRIGHT_PORT || '4196';
export default defineConfig({
  testDir: './tests/browser', testMatch: ['practice-workflow.spec.ts'], timeout: 60000, workers: 2,
  use: { baseURL: `http://127.0.0.1:${port}`, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'ipad-webkit', use: { ...devices['iPad Pro 11'], browserName: 'webkit', viewport: { width: 820, height: 1180 } } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: { command: `npm run preview -- --port ${port}`, port: Number(port), reuseExistingServer: true },
});
