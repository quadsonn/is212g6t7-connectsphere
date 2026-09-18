/**
 * Jest globalSetup for the e2e suite: creates the test database if it is
 * missing and brings it up to the latest migration.
 *
 * Requires a running PostgreSQL and the `createdb` client binary. CI will need
 * both (CLAUDE.md §8 — add when the pipeline lands).
 */
import { execSync } from 'node:child_process';
import { config } from 'dotenv';

export default function globalSetup(): void {
  config();

  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://postgres@localhost:5432/connectsphere_test?schema=public';

  const database = new URL(url).pathname.replace(/^\//, '');

  try {
    execSync(`createdb ${database}`, { stdio: 'ignore' });
  } catch {
    // Already exists — the migration below is the real check.
  }

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
