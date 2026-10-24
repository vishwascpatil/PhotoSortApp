import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  expect: {
    timeout: 10000
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/report.json' }]
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
})
