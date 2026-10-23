import { defineConfig, devices } from '@playwright/test';
const port = process.env.PLAYWRIGHT_PORT || '4196';
export default defineConfig({
  // Run the software-rendered Safari devices sequentially: simultaneous
  // compositors on the small CI runner delay frame callbacks and crypto saves.
  testDir: './tests/browser', testMatch: ['practice-workflow.spec.ts'], timeout: 60000, workers: 1,
  // WebKit's trace screencast throttles rendering and stalls IndexedDB in the
  // virtual display. Keep failure screenshots and the bounded I/O diagnostic;
  // functional checks must run without the screencast recording the browser.
  use: { baseURL: `http://127.0.0.1:${port}`, screenshot: 'only-on-failure', trace: 'off' },
  projects: [
    { name: 'ipad-webkit', use: { ...devices['iPad Pro 11'], browserName: 'webkit', viewport: { width: 820, height: 1180 } } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: { command: `npm run preview -- --port ${port}`, port: Number(port), reuseExistingServer: true },
});
