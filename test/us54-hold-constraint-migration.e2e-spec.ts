import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * US-54 — migration 20261017090100_us54_exclude_approved_and_held.
 *
 * Runs the real migration file against pre-US-54-constraint rows in a
 * throwaway schema of the test database (the US-24 pattern), so the public
 * schema is untouched. The setup recreates the US-24 constraint the migration
 * replaces.
 */
describe('US-54 exclude APPROVED and HELD migration', () => {
  const SCHEMA = 'us54_migration_test';
  const MIGRATION = join(
    __dirname,
    '../prisma/migrations/20261017090100_us54_exclude_approved_and_held/migration.sql',
  );

  let prisma: PrismaClient;
  let workDir: string;

  /** [id, venueId, start, end, status, holdExpiresAt?], times "HH:MM" on 1 Oct 2030. */
  type Row = [string, string, string, string, string, string?];

  const setupSql = (rows: Row[]) => `
    DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
    CREATE SCHEMA ${SCHEMA};
    SET search_path TO ${SCHEMA}, public;
    CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'HELD', 'RELEASED');
    CREATE TABLE "VenueBooking" (
      "id" TEXT PRIMARY KEY,
      "venueId" TEXT NOT NULL,
      "start" TIMESTAMP(3) NOT NULL,
      "end" TIMESTAMP(3) NOT NULL,
      "status" "BookingStatus" NOT NULL DEFAULT 'REQUESTED',
      "holdExpiresAt" TIMESTAMP(3)
    );
    ${rows
      .map(
        ([id, venue, from, to, status, expires]) =>
          `INSERT INTO "VenueBooking" VALUES ('${id}', '${venue}', '2030-10-01 ${from}', '2030-10-01 ${to}', '${status}', ${
            expires ? `'2030-09-30 ${expires}'` : 'NULL'
          });`,
      )
      .join('\n')}
    ALTER TABLE "VenueBooking"
      ADD CONSTRAINT "VenueBooking_no_overlapping_approved"
      EXCLUDE USING gist ("venueId" WITH =, tsrange("start", "end") WITH &&)
      WHERE ("status" = 'APPROVED');
  `;

  const migrationSql = () => `
    SET search_path TO ${SCHEMA}, public;
    ${readFileSync(MIGRATION, 'utf8')}
  `;

  const execute = (script: string) => {
    const file = join(workDir, 'run.sql');
    writeFileSync(file, script);
    execFileSync('npx', ['prisma', 'db', 'execute', '--file', file, '--url', process.env.DATABASE_URL!], {
      stdio: 'pipe',
    });
  };

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

  const constraints = async () =>
    (
      await prisma.$queryRawUnsafe<{ conname: string }[]>(
        `SELECT c.conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
          WHERE n.nspname = '${SCHEMA}' AND c.contype IN ('x', 'c') ORDER BY c.conname`,
      )
    ).map((r) => r.conname);

  const rowCount = async () =>
    Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${SCHEMA}."VenueBooking"`))[0].n);

  beforeAll(() => {
    prisma = new PrismaClient();
    workDir = mkdtempSync(join(tmpdir(), 'us54-'));
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await prisma.$disconnect();
    rmSync(workDir, { recursive: true, force: true });
  });

  it('US-54: replaces the constraint when data is clean (REQUESTED overlaps and back-to-back are fine)', async () => {
    const error = run([
      ['a', 'v1', '09:00', '12:00', 'APPROVED'],
      ['b', 'v1', '12:00', '15:00', 'HELD', '12:00'], // back-to-back
      ['c', 'v1', '10:00', '11:00', 'REQUESTED'], // pending overlap
      ['d', 'v1', '10:00', '11:00', 'RELEASED'], // holds nothing
    ]);

    expect(error).toBeNull();
    expect(await constraints()).toEqual(['VenueBooking_hold_has_expiry', 'VenueBooking_no_overlapping_committed']);
    expect(await rowCount()).toBe(4);
  }, 60_000);

  it('US-54: stops and lists an APPROVED/HELD overlap, changing nothing', async () => {
    const error = run([
      ['approved', 'v1', '09:00', '12:00', 'APPROVED'],
      ['held', 'v1', '11:00', '13:00', 'HELD', '12:00'],
      ['fine', 'v2', '09:00', '12:00', 'HELD', '12:00'],
    ]);

    expect(error).toMatch(/US-54 migration stopped/);
    expect(error).toMatch(/approved \(APPROVED\) and held \(HELD\) on venue v1/);
    expect(error).not.toMatch(/fine/);
    expect(await constraints()).toEqual(['VenueBooking_no_overlapping_approved']);
    expect(await rowCount()).toBe(3);
  }, 60_000);

  it('US-54: stops on a HELD booking with no expiry', async () => {
    const error = run([['forever', 'v1', '09:00', '12:00', 'HELD']]);

    expect(error).toMatch(/HELD bookings with no expiry/);
    expect(error).toMatch(/forever/);
    expect(await constraints()).toEqual(['VenueBooking_no_overlapping_approved']);
  }, 60_000);
});
