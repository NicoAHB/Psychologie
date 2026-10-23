import { defineConfig, devices } from '@playwright/test';
const port = process.env.PLAYWRIGHT_PORT || '4196';
// The virtual Xvfb display has no retina GPU. Keep CSS viewport/touch/UA,
// but avoid rendering nine physical pixels per CSS pixel in software on CI.
// Local runs retain the device's native pixel ratio.
const softwareDisplay = process.env.WEBKIT_DISABLE_COMPOSITING_MODE === '1' ? { deviceScaleFactor: 1 } : {};
export default defineConfig({
  // Run tests sequentially within each software-rendered Safari project.
  // CI isolates the devices on separate runners to avoid competing compositors.
  testDir: './tests/browser', testMatch: ['practice-workflow.spec.ts', 'marketing.spec.ts', 'appearance.spec.ts', 'referrals.spec.ts', 'simple-workflow.spec.ts', 'phase-a.spec.ts', 'phase-b.spec.ts'], timeout: 60000, workers: 1,
  // Avoid screencast overhead while measuring rendering and IndexedDB in the
  // virtual display. Keep failure screenshots and the bounded I/O diagnostic.
  // The app's reduced-motion CSS removes drawer/chart transitions. Keep glass
  // and normal click stability checks enabled on the virtual software display.
  use: { baseURL: `http://127.0.0.1:${port}`, screenshot: 'only-on-failure', trace: 'off', reducedMotion: 'reduce' },
  projects: [
    { name: 'ipad-webkit', use: { ...devices['iPad Pro 11'], ...softwareDisplay, browserName: 'webkit', viewport: { width: 820, height: 1180 } } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], ...softwareDisplay, browserName: 'webkit' } },
  ],
  webServer: { command: `npm run preview -- --port ${port}`, port: Number(port), reuseExistingServer: true },
});
