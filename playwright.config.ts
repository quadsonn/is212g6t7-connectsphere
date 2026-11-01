import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

import { assertSafeTestDatabaseUrl } from './test/helpers/db-guard';

/**
 * End-to-end (browser) tests: Playwright drives the real React app, which
 * calls the real Nest API, which uses the local `connectsphere_test` database.
 *
 * Run: `npm run test:browser` (starts both servers itself, then stops them).
 *
 * Isolation from development:
 * - the API and the web app run on their own ports (3100, 5174), never the
 *   dev servers' 3000/5173, and reuseExistingServer is off, so a running
 *   `npm run dev` is never used or disturbed;
 * - the API's DATABASE_URL and DIRECT_URL are overridden with the test
 *   database, and the guard below refuses anything that is not a local
 *   `_test` database before either server starts;
 * - each test resets the database and loads its setup scripts
 *   (e2e/support/db.ts), the same scripts the integration tests use.
 */
loadDotenv();

const TEST_DB =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres@localhost:5432/connectsphere_test?schema=public';
assertSafeTestDatabaseUrl(TEST_DB);

// The test runner's own Prisma client (e2e/support/db.ts) reads these too.
process.env.DATABASE_URL = TEST_DB;
process.env.DIRECT_URL = TEST_DB;

const API_PORT = 3100;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // One database, so one test at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: './e2e/support/global-setup.ts',
  reporter: [['list'], ['html', { outputFolder: 'e2e/report', open: 'never' }]],
  outputDir: 'e2e/results',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // ts-node (transpile only) rather than `nest start`, so this never
      // writes to dist/, which a running `npm run dev` is using.
      command: 'npx ts-node -T src/main.ts',
      url: `http://127.0.0.1:${API_PORT}/auth/me`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: TEST_DB,
        DIRECT_URL: TEST_DB,
        PORT: String(API_PORT),
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
        // Turns off the scheduled jobs (ScheduleModule), as in the Jest suites.
        NODE_ENV: 'test',
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: './frontend',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_URL: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
