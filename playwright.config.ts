import { defineConfig } from '@playwright/test'

// The Electron app is launched with Chromium's --headless switch (see
// tests/e2e/launch.ts), so the suite never steals desktop focus; set
// AME_E2E_HEADED=1 to run with a visible window when debugging.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure'
  }
})
