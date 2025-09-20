import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Neptune's Pride Agent testing
 * 
 * This configuration sets up browser testing for the Chrome extension
 * with proper extension loading and game environment setup.
 */
export default defineConfig({
  testDir: './tests/playwright',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/results.json' }]
  ],
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
        // Extension testing requires a persistent context
        launchOptions: {
          // Add extension loading args here when we have a built extension
          args: []
        }
      },
    },
  ],

  webServer: {
    command: 'npm run test:server',
    port: 8080,
    reuseExistingServer: !process.env.CI,
  },
});