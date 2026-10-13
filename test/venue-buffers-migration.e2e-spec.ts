import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * US-49 — migration 20261013090000_us49_venue_buffer_times against venues
 * that existed before it.
 *
 * Same approach as the US-18 migration test: the real migration file runs
 * against old-shaped rows in a throwaway schema of the test database, so the
 * public schema (already migrated) is untouched.
 */
describe('US-49 venue buffer times migration', () => {
  const SCHEMA = 'us49_migration_test';
  const MIGRATION = join(
    __dirname,
    '../prisma/migrations/20261013090000_us49_venue_buffer_times/migration.sql',
  );

  let prisma: PrismaClient;
  let workDir: string;

  const run = (sql: string) => {
    const file = join(workDir, `run-${Date.now()}.sql`);
    writeFileSync(file, sql);
    execFileSync('npx', ['prisma', 'db', 'execute', '--file', file, '--url', process.env.DATABASE_URL!], {
      stdio: 'pipe',
    });
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    workDir = mkdtempSync(join(tmpdir(), 'us49-'));

    // The venues as they exist before US-49: no buffer columns, a mix of
    // published, draft and incomplete rows.
    run(`
      DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
      CREATE SCHEMA ${SCHEMA};
      SET search_path TO ${SCHEMA};
      CREATE TABLE "Venue" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT,
        "capacity" INTEGER
      );
      INSERT INTO "Venue" ("id", "name", "capacity") VALUES
        ('published', 'Sandbox Auditorium', 420),
        ('incomplete', NULL, NULL);
      ${readFileSync(MIGRATION, 'utf8')}
    `);
  }, 60_000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await prisma.$disconnect();
    rmSync(workDir, { recursive: true, force: true });
  });

  it('US-49 AC-2: every existing venue gets 0 setup and 0 turnaround, other columns untouched', async () => {
    const rows = await prisma.$queryRawUnsafe<
      { id: string; name: string | null; capacity: number | null; setupMinutes: number; turnaroundMinutes: number }[]
    >(`SELECT "id", "name", "capacity", "setupMinutes", "turnaroundMinutes" FROM ${SCHEMA}."Venue" ORDER BY "id"`);

    expect(rows).toEqual([
      { id: 'incomplete', name: null, capacity: null, setupMinutes: 0, turnaroundMinutes: 0 },
      { id: 'published', name: 'Sandbox Auditorium', capacity: 420, setupMinutes: 0, turnaroundMinutes: 0 },
    ]);
  });

  it.each([
    ['setupMinutes', -1],
    ['setupMinutes', 481],
    ['turnaroundMinutes', -1],
    ['turnaroundMinutes', 481],
  ])('US-49 AC-3: the database refuses %s = %p', async (column, value) => {
    await expect(
      prisma.$executeRawUnsafe(`UPDATE ${SCHEMA}."Venue" SET "${column}" = ${value} WHERE "id" = 'published'`),
    ).rejects.toThrow(/check constraint/i);
  });

  it('US-49 AC-3: the database accepts the boundaries 0 and 480', async () => {
    await prisma.$executeRawUnsafe(
      `UPDATE ${SCHEMA}."Venue" SET "setupMinutes" = 480, "turnaroundMinutes" = 0 WHERE "id" = 'published'`,
    );
  });
});
