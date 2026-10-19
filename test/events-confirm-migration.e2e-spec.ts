import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * US-42 — migration 20261015090000_us42_confirm_arrangements against events
 * and equipment lines that existed before it. Same approach as the US-18,
 * US-49 and US-51 migration tests: the real file runs against old-shaped rows
 * in a throwaway schema.
 */
describe('US-42 confirm arrangements migration', () => {
  const SCHEMA = 'us42_migration_test';
  const ALREADY = 'us42_migration_test_already';
  const MIGRATION = join(
    __dirname,
    '../prisma/migrations/20261015090000_us42_confirm_arrangements/migration.sql',
  );

  let prisma: PrismaClient;
  let workDir: string;

  const oldShape = (schema: string, statuses: string[]) => `
      DROP SCHEMA IF EXISTS ${schema} CASCADE;
      CREATE SCHEMA ${schema};
      SET search_path TO ${schema};
      CREATE TYPE "EventStatus" AS ENUM (${statuses.map((s) => `'${s}'`).join(', ')});
      CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "EventRequest" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT,
        "status" "EventStatus" NOT NULL DEFAULT 'DRAFT'
      );
      CREATE TABLE "EquipmentRequirement" (
        "id" TEXT PRIMARY KEY,
        "eventId" TEXT NOT NULL,
        "equipmentId" TEXT,
        "equipmentType" TEXT NOT NULL,
        "quantity" INTEGER NOT NULL,
        "notes" TEXT
      );
      INSERT INTO "EventRequest" ("id", "name", "status") VALUES
        ('planning', 'Showcase', 'PLANNING'),
        ('confirmed', 'Gala', 'CONFIRMED');
      INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentId", "equipmentType", "quantity", "notes") VALUES
        ('linked', 'planning', 'eq-1', 'Projector', 2, NULL),
        ('free', 'planning', NULL, 'Stage lighting rig', 1, 'Front of stage');
      ${readFileSync(MIGRATION, 'utf8')}
  `;

  const run = (sql: string) => {
    const file = join(workDir, 'run.sql');
    writeFileSync(file, sql);
    execFileSync('npx', ['prisma', 'db', 'execute', '--file', file, '--url', process.env.DATABASE_URL!], {
      stdio: 'pipe',
    });
  };

  const BEFORE = [
    'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'RETURNED', 'AWAITING_CLARIFICATION',
    'REJECTED', 'PLANNING', 'AWAITING_ARRANGEMENTS', 'CONFIRMED', 'COMPLETED', 'CANCELLED',
  ];

  beforeAll(async () => {
    prisma = new PrismaClient();
    workDir = mkdtempSync(join(tmpdir(), 'us42-'));

    run(oldShape(SCHEMA, BEFORE));
  }, 60_000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${ALREADY} CASCADE`);
    await prisma.$disconnect();
    rmSync(workDir, { recursive: true, force: true });
  });

  it('US-42: existing events keep their status and are not marked confirmed', async () => {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT "id", "name", "status"::TEXT AS "status", "arrangementsConfirmedAt", "arrangementsConfirmedById"
         FROM ${SCHEMA}."EventRequest" ORDER BY "id"`,
    );

    expect(rows).toEqual([
      { id: 'confirmed', name: 'Gala', status: 'CONFIRMED', arrangementsConfirmedAt: null, arrangementsConfirmedById: null },
      { id: 'planning', name: 'Showcase', status: 'PLANNING', arrangementsConfirmedAt: null, arrangementsConfirmedById: null },
    ]);
  });

  it('US-42: existing equipment lines keep every value and are not ticked', async () => {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT "id", "equipmentId", "equipmentType", "quantity", "notes", "manuallyConfirmedAt", "manuallyConfirmedById"
         FROM ${SCHEMA}."EquipmentRequirement" ORDER BY "id"`,
    );

    expect(rows).toEqual([
      {
        id: 'free',
        equipmentId: null,
        equipmentType: 'Stage lighting rig',
        quantity: 1,
        notes: 'Front of stage',
        manuallyConfirmedAt: null,
        manuallyConfirmedById: null,
      },
      {
        id: 'linked',
        equipmentId: 'eq-1',
        equipmentType: 'Projector',
        quantity: 2,
        notes: null,
        manuallyConfirmedAt: null,
        manuallyConfirmedById: null,
      },
    ]);
  });

  it('US-42: adds AWAITING_SAFETY_CHECK just before CONFIRMED', async () => {
    const values = await prisma.$queryRawUnsafe<{ v: string }[]>(
      `SELECT unnest(enum_range(NULL::${SCHEMA}."EventStatus"))::TEXT AS v`,
    );

    const expected = [...BEFORE];
    expected.splice(BEFORE.indexOf('CONFIRMED'), 0, 'AWAITING_SAFETY_CHECK');
    expect(values.map((r) => r.v)).toEqual(expected);
  });

  it('US-42: runs cleanly when US-57 has already added the status', async () => {
    const withSafety = [...BEFORE];
    withSafety.splice(BEFORE.indexOf('CONFIRMED'), 0, 'AWAITING_SAFETY_CHECK');

    expect(() => run(oldShape(ALREADY, withSafety))).not.toThrow();

    const values = await prisma.$queryRawUnsafe<{ v: string }[]>(
      `SELECT unnest(enum_range(NULL::${ALREADY}."EventStatus"))::TEXT AS v`,
    );
    expect(values.map((r) => r.v)).toEqual(withSafety);
  });
});
