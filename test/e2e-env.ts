/**
 * Runs before each e2e test file. Points Prisma at a dedicated test database
 * so e2e runs never touch development data.
 */
import { config } from 'dotenv';

import { assertSafeTestDatabaseUrl, describeDatabaseUrl } from './helpers/db-guard';

config();

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres@localhost:5432/connectsphere_test?schema=public';
// schema.prisma's directUrl — must never fall through to the shared database.
process.env.DIRECT_URL = process.env.DATABASE_URL;

// Throws (failing the whole file) unless both point at a local _test database.
assertSafeTestDatabaseUrl(process.env.DATABASE_URL);
assertSafeTestDatabaseUrl(process.env.DIRECT_URL);

if (process.env.E2E_PRINT_DB === '1') {
  for (const key of ['DATABASE_URL', 'DIRECT_URL'] as const) {
    const { host, database } = describeDatabaseUrl(process.env[key]!);
    console.info(`[e2e-env] ${key} -> host=${host} db=${database}`);
  }
}

process.env.JWT_SECRET ??= 'e2e-only-secret';
process.env.JWT_EXPIRES_IN ??= '1h';
