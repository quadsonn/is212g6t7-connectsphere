import { PrismaClient } from '@prisma/client';

import { assertConnectedToTestDatabase } from './db-guard';

/**
 * Empties every application table in one statement, so each integration test
 * starts from a known state (FIRST: isolated, repeatable).
 *
 * The table list is read from the database rather than maintained by hand:
 * a table added by a later migration is reset automatically, and no test file
 * can forget one. Only the migration history is kept.
 */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await assertConnectedToTestDatabase(prisma);

  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT table_name AS name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'`,
  );

  if (tables.length === 0) {
    return;
  }

  const list = tables
    .map(({ name }) => `"public"."${name.replace(/"/g, '""')}"`)
    .join(', ');

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
