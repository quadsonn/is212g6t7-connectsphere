/**
 * Runs before each e2e test file. Points Prisma at a dedicated test database
 * so e2e runs never touch development data.
 */
import { config } from 'dotenv';

config();

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres@localhost:5432/connectsphere_test?schema=public';
process.env.DIRECT_URL = process.env.DATABASE_URL;

process.env.JWT_SECRET ??= 'e2e-only-secret';
process.env.JWT_EXPIRES_IN ??= '1h';
