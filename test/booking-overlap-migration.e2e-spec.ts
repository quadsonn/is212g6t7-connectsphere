import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * US-23 (Story 23) — migration 20261005140014_us24_no_overlapping_approved_bookings
 * (the folder keeps the old US-24 label; migration folders are never renamed).
 *
 * The code under test: the migration adds the VenueBooking_no_overlapping_approved
 * EXCLUDE constraint, the database backstop for AC-5. Before adding it, it
 * looks for existing APPROVED bookings that already overlap (or end before
 * they start) and, if it finds any, stops with a list of them instead of
 * failing halfway or silently changing data.
 *
 * Runs the real migration file against old-shaped rows in a throwaway schema
 * of the test database, so the public schema (already migrated) is untouched.
 * `prisma db execute` runs it, as the migration is a multi-statement script.
 *
 * Pre-condition (TC-S2-65): none from test/fixtures/sql. Each test builds its
 * own rows in the throwaway schema and drops it afterwards.
 */
describe('US-23 no-overlapping-approved migration', () => {
  const SCHEMA = 'us24_migration_test';
  const MIGRATION = join(
    __dirname,
    '../prisma/migrations/20261005140014_us24_no_overlapping_approved_bookings/migration.sql',
  );

  let prisma: PrismaClient;
  let workDir: string;

  /** Rows as [id, venueId, start, end, status], times as "HH:MM" on 1 Oct 2030. */
  type Row = [string, string, string, string, string];

  const setupSql = (rows: Row[]) => `
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    CREATE SCHEMA ${SCHEMA};
    -- btree_gist is installed in public; keep it on the path for its opclasses.
    SET search_path TO ${SCHEMA}, public;
    CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');
    CREATE TABLE "VenueBooking" (
      "id" TEXT PRIMARY KEY,
      "venueId" TEXT NOT NULL,
      "start" TIMESTAMP(3) NOT NULL,
      "end" TIMESTAMP(3) NOT NULL,
      "status" "BookingStatus" NOT NULL DEFAULT 'REQUESTED'
    );
    ${rows
      .map(
        ([id, venue, from, to, status]) =>
          `INSERT INTO "VenueBooking" VALUES ('${id}', '${venue}', '2030-10-01 ${from}', '2030-10-01 ${to}', '${status}');`,
      )
      .join('\n')}
  `;

  const migrationSql = () => `
    SET search_path TO ${SCHEMA}, public;
    ${readFileSync(MIGRATION, 'utf8')}
  `;

  /**
   * Setup and migration run as separate scripts: \`prisma db execute\` wraps a
   * script in one transaction, so a failing migration would otherwise roll
   * back the setup with it.
   */
  const execute = (script: string) => {
    const file = join(workDir, 'run.sql');
    writeFileSync(file, script);
    execFileSync('npx', ['prisma', 'db', 'execute', '--file', file, '--url', process.env.DATABASE_URL!], {
      stdio: 'pipe',
    });
  };

  /** Sets up the rows, then runs the migration; returns its error output, or null. */
  const run = (rows: Row[]): string | null => {
    execute(setupSql(rows));
    try {
      execute(migrationSql());
      return null;
    } catch (error) {
      const e = error as { stderr?: Buffer; stdout?: Buffer };
      return `${e.stderr?.toString() ?? ''}${e.stdout?.toString() ?? ''}`;
    }
  };

  const constraintExists = async () =>
    (
      await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
          WHERE n.nspname = '${SCHEMA}' AND c.conname = 'VenueBooking_no_overlapping_approved'`,
      )
    )[0].n > 0n;

  const rowCount = async () =>
    Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${SCHEMA}."VenueBooking"`))[0].n);

  beforeAll(() => {
    prisma = new PrismaClient();
    workDir = mkdtempSync(join(tmpdir(), 'us24-'));
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await prisma.$disconnect();
    rmSync(workDir, { recursive: true, force: true });
  });

  // TC-S2-65 · US-23 AC-5 · setup: own schema (clean rows) · fails if the migration refused clean data, or lost rows
  // Code: with no clashing APPROVED rows the migration adds the constraint and leaves every row in place.
  it('US-23: adds the constraint when existing data is clean (back-to-back and pending overlaps are fine)', async () => {
    const error = run([
      ['a', 'v1', '09:00', '12:00', 'APPROVED'],
      ['b', 'v1', '12:00', '15:00', 'APPROVED'], // back-to-back
      ['c', 'v1', '10:00', '11:00', 'REQUESTED'], // pending overlap
      ['d', 'v1', '10:00', '11:00', 'REJECTED'],
      ['e', 'v2', '09:00', '12:00', 'APPROVED'], // same time, other venue
    ]);

    expect(error).toBeNull();
    expect(await constraintExists()).toBe(true);
    expect(await rowCount()).toBe(5);
  }, 60_000);

  // TC-S2-65 · US-23 AC-5 · setup: own schema (two clashing pairs) · fails if the migration ran over existing double bookings, or didn't name them
  // Code: the migration's pre-check RAISEs an error naming each clashing pair, so nothing is changed.
  it('US-23: stops and lists existing overlapping APPROVED bookings, changing nothing', async () => {
    const error = run([
      ['keep-1', 'v1', '09:00', '12:00', 'APPROVED'],
      ['clash-1', 'v1', '11:00', '13:00', 'APPROVED'],
      ['keep-2', 'v2', '09:00', '10:00', 'APPROVED'],
      ['clash-2', 'v2', '09:30', '09:45', 'APPROVED'],
      ['fine', 'v3', '09:00', '12:00', 'APPROVED'],
    ]);

    expect(error).toMatch(/US-24 migration stopped/);
    expect(error).toMatch(/clash-1 and keep-1 on venue v1/);
    expect(error).toMatch(/clash-2 and keep-2 on venue v2/);
    expect(error).not.toMatch(/fine/);
    expect(await constraintExists()).toBe(false);
    expect(await rowCount()).toBe(5);
  }, 60_000);

  // TC-S2-65 · US-23 AC-5 · setup: own schema (a backwards row) · fails if an APPROVED booking ending before it starts slipped past the check
  // Code: tsrange() would error on such a row, so the pre-check reports it separately.
  it('US-23: also reports APPROVED bookings whose end is before their start', async () => {
    const error = run([['backwards', 'v1', '12:00', '09:00', 'APPROVED']]);

    expect(error).toMatch(/ending before they start/);
    expect(error).toMatch(/backwards/);
    expect(await constraintExists()).toBe(false);
  }, 60_000);
});
