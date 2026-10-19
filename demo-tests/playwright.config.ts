import { defineConfig, devices } from '@playwright/test';
import { COORDINATOR_STATE } from './tests/support';

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
  // Run tests side by side, up to 4 at once. The tests share one database, so
  // any test that writes data must not depend on another test's writes.
  fullyParallel: true,
  workers: 4,
  retries: 0,
  // Give up on a failing check after 2s, not the default 5s.
  expect: { timeout: 2000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // The web app, not the API (:3000).
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // Logs in once over the API and saves the session for the tests below.
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chrome',
      // Uses the Google Chrome already installed (the one Playwright MCP
      // drives), so no extra browser download is needed.
      use: { ...devices['Desktop Chrome'], channel: 'chrome', storageState: COORDINATOR_STATE },
      dependencies: ['setup'],
    },
  ],
});
