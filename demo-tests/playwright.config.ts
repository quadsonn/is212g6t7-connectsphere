import { defineConfig, devices } from '@playwright/test';

/**
 * W10 demo — runs the agent-generated tests against whichever branch is
 * currently running via `npm run dev:demo` (w10_demo = clean,
 * w10_demo-bugs = planted bugs).
 *
 * Always `npm run demo:reset` before a test run, so every run starts from the
 * same seed data.
 */
export default defineConfig({
  testDir: './tests',
  // The tests share one database, so run them one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // The web app, not the API (:3000).
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      // Uses the Google Chrome already installed (the one Playwright MCP
      // drives), so no extra browser download is needed.
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
});
