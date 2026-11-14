import { defineConfig, devices } from '@playwright/test'

/**
 * End to end against the real FastAPI backend and a production build (spec §14). The
 * backend's state is shared, so tests run one at a time; 3-review mutates it (withdraw,
 * override, verify) and so runs last, after every other spec.
 */
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e/.tmp/test-results',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'read-only',
      testIgnore: '3-review.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'review',
      testMatch: '3-review.spec.ts',
      dependencies: ['read-only'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node e2e/start-api.mjs',
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      // Its own output directory, so the e2e environment never lands in dist/ (the deploy build).
      command: 'npm run build:e2e && npm run preview:e2e -- --port 4173',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        VITE_SAMPLE_SHARE_ID: 'e2e-sample-share-id-000000',
        VITE_CONTACT_EMAIL: 'e2e@example.invalid',
      },
    },
  ],
})
