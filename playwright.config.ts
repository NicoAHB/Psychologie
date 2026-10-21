import { defineConfig, devices } from '@playwright/test';
const port = process.env.PLAYWRIGHT_PORT || '4173';
export default defineConfig({
  testDir: './tests/browser', timeout: 45000, fullyParallel: false,
  use: { baseURL: `http://127.0.0.1:${port}`, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH === 'bundled' ? undefined : process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
  webServer: { command: `npm run preview -- --port ${port}`, port: Number(port), reuseExistingServer: true },
});
