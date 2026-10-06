import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AccessibilityFeature, PrismaClient } from '@prisma/client';

/**
 * US-18 — the free-text → enum backfill in migration
 * 20261003120000_us18_venue_vocabulary.
 *
 * Runs the real migration file against old-shaped rows in a throwaway schema
 * of the test database, so the public schema (already migrated) is untouched.
 * `prisma db execute` is used because the migration is a multi-statement
 * script, which Prisma's raw-query methods cannot run.
 */
describe('US-18 venue vocabulary migration (backfill)', () => {
  const SCHEMA = 'us18_migration_test';
  const MARKER = 'Unmapped during US-18 migration: ';
  const MIGRATION = join(
    __dirname,
    '../prisma/migrations/20261003120000_us18_venue_vocabulary/migration.sql',
  );

  let prisma: PrismaClient;
  let workDir: string;

  interface Row {
    id: string;
    facilities: string[];
    accessibilityFeatures: string[];
    facilityNotes: string | null;
    accessibilityNotes: string | null;
  }
  const rows: Record<string, Row> = {};

  const sqlArray = (values: string[] | null) =>
    values === null
      ? 'NULL'
      : `ARRAY[${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')}]::TEXT[]`;

  /** The venues as they exist before US-18: free text, no notes columns. */
  const LEGACY: [string, string[] | null, string[] | null][] = [
    // The values actually present in the shared database today.
    ['clean', ['Power supply', 'speakers', 'stage'], ['Step-free access']],
    // Mixed: some map, some do not.
    ['mixed', ['Marquee points', 'Power supply'], ['Accessible toilets nearby', 'Hearing loop', 'Braille signage']],
    // Synonyms of one value, odd casing and whitespace.
    ['synonyms', ['PA system', 'Speakers', '  WIFI  ', 'wi-fi'], ['LIFT', 'elevator']],
    ['empty', null, []],
    ['blank', ['', '   '], ['  ']],
  ];

  beforeAll(async () => {
    prisma = new PrismaClient();
    workDir = mkdtempSync(join(tmpdir(), 'us18-'));

    const setup = `
      DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
      CREATE SCHEMA ${SCHEMA};
      SET search_path TO ${SCHEMA};
      CREATE TYPE "AccessibilityFeature" AS ENUM (${Object.values(AccessibilityFeature)
        .map((v) => `'${v}'`)
        .join(', ')});
      CREATE TYPE "VenueStatus" AS ENUM ('DRAFT', 'PUBLISHED');
      CREATE TABLE "Venue" (
        "id" TEXT PRIMARY KEY,
        "status" "VenueStatus" NOT NULL DEFAULT 'PUBLISHED',
        "capacity" INTEGER,
        "facilities" TEXT[],
        "accessibilityFeatures" TEXT[]
      );
      ${LEGACY.map(
        ([id, facilities, access]) =>
          `INSERT INTO "Venue" ("id", "facilities", "accessibilityFeatures")
           VALUES ('${id}', ${sqlArray(facilities)}, ${sqlArray(access)});`,
      ).join('\n')}
    `;

    const file = join(workDir, 'run.sql');
    writeFileSync(file, `${setup}\n${readFileSync(MIGRATION, 'utf8')}`);
    execFileSync('npx', ['prisma', 'db', 'execute', '--file', file, '--url', process.env.DATABASE_URL!], {
      stdio: 'pipe',
    });

    const result = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT "id", "facilities"::TEXT[] AS "facilities",
              "accessibilityFeatures"::TEXT[] AS "accessibilityFeatures",
              "facilityNotes", "accessibilityNotes"
         FROM ${SCHEMA}."Venue"`,
    );
    for (const row of result) rows[row.id] = row;
  }, 60_000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await prisma.$disconnect();
    rmSync(workDir, { recursive: true, force: true });
  });

  it('US-18: maps every value currently in the shared database', () => {
    expect(rows.clean).toEqual({
      id: 'clean',
      facilities: ['SOUND_SYSTEM', 'STAGE', 'POWER_OUTLETS'],
      accessibilityFeatures: ['STEP_FREE_ACCESS'],
      facilityNotes: null,
      accessibilityNotes: null,
    });
  });

  it('US-18: keeps an unmapped value in the notes column instead of dropping it', () => {
    expect(rows.mixed.facilities).toEqual(['POWER_OUTLETS']);
    expect(rows.mixed.facilityNotes).toBe(`${MARKER}Marquee points`);
  });

  it('US-18: keeps every unmapped value, in original order', () => {
    expect(rows.mixed.accessibilityFeatures).toEqual(['HEARING_LOOP']);
    expect(rows.mixed.accessibilityNotes).toBe(
      `${MARKER}Accessible toilets nearby; Braille signage`,
    );
  });

  it('US-18: folds synonyms, casing and whitespace onto one value without duplicates', () => {
    expect(rows.synonyms.facilities).toEqual(['SOUND_SYSTEM', 'WIFI']);
    expect(rows.synonyms.accessibilityFeatures).toEqual(['WHEELCHAIR_ACCESSIBLE_LIFT']);
    expect(rows.synonyms.facilityNotes).toBeNull();
  });

  it('US-18: turns a null or empty list into an empty array with no notes', () => {
    expect(rows.empty).toMatchObject({
      facilities: [],
      accessibilityFeatures: [],
      facilityNotes: null,
      accessibilityNotes: null,
    });
  });

  it('US-18: ignores blank strings rather than reporting them', () => {
    expect(rows.blank).toMatchObject({
      facilities: [],
      accessibilityFeatures: [],
      facilityNotes: null,
      accessibilityNotes: null,
    });
  });
});
