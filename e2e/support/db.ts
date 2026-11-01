import { PrismaClient } from '@prisma/client';

import { loadSql } from '../../test/helpers/load-sql';
import { resetDb } from '../../test/helpers/reset-db';

/**
 * The browser tests' view of the test database. playwright.config.ts has
 * already pointed DATABASE_URL at the local `connectsphere_test` database;
 * resetDb and loadSql both refuse to write to anything else.
 */
export const prisma = new PrismaClient();

/**
 * A test case's pre-condition: empty every table, then run its setup
 * scripts from test/fixtures/sql/, the same ones the integration tests load.
 */
export async function given(...scripts: string[]): Promise<void> {
  await resetDb(prisma);
  for (const script of scripts) await loadSql(prisma, script);
}
