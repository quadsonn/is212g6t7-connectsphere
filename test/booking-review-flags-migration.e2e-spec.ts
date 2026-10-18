import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * US-51 — migration 20261014090000_us51_booking_review_flags against bookings
 * that existed before it. Same approach as the US-18 and US-49 migration
 * tests: the real file runs against old-shaped rows in a throwaway schema.
 */
describe('US-51 booking review flags migration', () => {
  const SCHEMA = 'us51_migration_test';
  const MIGRATION = join(
    __dirname,
    '../prisma/migrations/20261014090000_us51_booking_review_flags/migration.sql',
  );

  let prisma: PrismaClient;
  let workDir: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    workDir = mkdtempSync(join(tmpdir(), 'us51-'));

    const file = join(workDir, 'run.sql');
    writeFileSync(
      file,
      `
      DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
      CREATE SCHEMA ${SCHEMA};
      SET search_path TO ${SCHEMA};
      CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');
      CREATE TYPE "BookingDecisionKind" AS ENUM ('DECISION', 'REVERSAL');
      CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "VenueBooking" (
        "id" TEXT PRIMARY KEY,
        "venueId" TEXT NOT NULL,
        "start" TIMESTAMP(3) NOT NULL,
        "end" TIMESTAMP(3) NOT NULL,
        "status" "BookingStatus" NOT NULL DEFAULT 'REQUESTED',
        "decisionReason" TEXT
      );
      INSERT INTO "VenueBooking" ("id", "venueId", "start", "end", "status", "decisionReason") VALUES
        ('approved', 'v1', '2030-10-01 10:00', '2030-10-01 12:00', 'APPROVED', 'Fine'),
        ('pending',  'v1', '2030-10-01 12:30', '2030-10-01 14:00', 'REQUESTED', NULL);
      ${readFileSync(MIGRATION, 'utf8')}
      `,
    );
    execFileSync('npx', ['prisma', 'db', 'execute', '--file', file, '--url', process.env.DATABASE_URL!], {
      stdio: 'pipe',
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await prisma.$disconnect();
    rmSync(workDir, { recursive: true, force: true });
  });

  it('US-51: existing bookings are not flagged, and nothing else about them changes', async () => {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT "id", "status"::TEXT AS "status", "decisionReason", "start", "end",
              "needsReview", "needsReviewReason", "flaggedAt", "reviewResolvedAt", "reviewResolvedById"
         FROM ${SCHEMA}."VenueBooking" ORDER BY "id"`,
    );

    expect(rows).toEqual([
      {
        id: 'approved',
        status: 'APPROVED',
        decisionReason: 'Fine',
        start: new Date('2030-10-01T10:00:00Z'),
        end: new Date('2030-10-01T12:00:00Z'),
        needsReview: false,
        needsReviewReason: null,
        flaggedAt: null,
        reviewResolvedAt: null,
        reviewResolvedById: null,
      },
      expect.objectContaining({ id: 'pending', status: 'REQUESTED', needsReview: false }),
    ]);
  });

  it('US-51: adds REVIEW_RESOLVED to BookingDecisionKind, keeping the existing values', async () => {
    const values = await prisma.$queryRawUnsafe<{ v: string }[]>(
      `SELECT unnest(enum_range(NULL::${SCHEMA}."BookingDecisionKind"))::TEXT AS v`,
    );

    expect(values.map((r) => r.v)).toEqual(['DECISION', 'REVERSAL', 'REVIEW_RESOLVED']);
  });
});
