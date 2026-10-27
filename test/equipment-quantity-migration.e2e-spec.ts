import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * US-45 (reopened) — migration 20261026100000_us45_equipment_quantity_status,
 * which turns the one status per item into damaged and under-maintenance
 * counts.
 *
 * Runs the real migration file against old-shaped rows in a throwaway schema
 * of the test database, as the US-18 migration test does, so the public
 * schema (already migrated) is untouched.
 *
 * Nothing may be lost: an item marked as a whole keeps all its units in that
 * state, and history rows recorded before counts existed carry the item's
 * total.
 */
describe('US-45 equipment quantity migration (backfill)', () => {
  const SCHEMA = 'us45_migration_test';
  const MIGRATION = join(
    __dirname,
    '../prisma/migrations/20261026100000_us45_equipment_quantity_status/migration.sql',
  );

  let prisma: PrismaClient;
  let workDir: string;

  interface Item {
    id: string;
    totalQuantity: number;
    operationalStatus: string;
    damagedQuantity: number;
    maintenanceQuantity: number;
  }
  const items: Record<string, Item> = {};
  let history: { id: string; quantity: number }[] = [];

  const q = (sql: string) => prisma.$queryRawUnsafe<Item[]>(sql);

  beforeAll(async () => {
    prisma = new PrismaClient();
    workDir = mkdtempSync(join(tmpdir(), 'us45-'));

    // The tables as they are before US-45 is reopened: one status per item.
    const setup = `
      DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE;
      CREATE SCHEMA ${SCHEMA};
      SET search_path TO ${SCHEMA};

      CREATE TABLE "IdCounter" ("prefix" TEXT PRIMARY KEY, "last" INTEGER NOT NULL);
      CREATE FUNCTION next_readable_id(p_prefix TEXT) RETURNS TEXT LANGUAGE sql VOLATILE AS $$
        INSERT INTO "IdCounter" ("prefix", "last") VALUES (p_prefix, 1)
        ON CONFLICT ("prefix") DO UPDATE SET "last" = "IdCounter"."last" + 1
        RETURNING p_prefix || '-' || lpad("last"::text, 3, '0');
      $$;

      CREATE TYPE "EquipmentStatus" AS ENUM ('OPERATIONAL', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE');
      CREATE TYPE "NotificationType" AS ENUM ('EQUIPMENT_UNAVAILABLE', 'EQUIPMENT_RELEASED');
      CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "Equipment" (
        "id" TEXT PRIMARY KEY,
        "type" TEXT NOT NULL,
        "totalQuantity" INTEGER NOT NULL,
        "operationalStatus" "EquipmentStatus" NOT NULL DEFAULT 'OPERATIONAL',
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE "EquipmentReservation" ("id" TEXT PRIMARY KEY);
      CREATE TABLE "EquipmentStatusChange" (
        "id" TEXT PRIMARY KEY,
        "equipmentId" TEXT NOT NULL REFERENCES "Equipment"("id"),
        "fromStatus" "EquipmentStatus" NOT NULL,
        "toStatus" "EquipmentStatus" NOT NULL,
        "reason" TEXT NOT NULL
      );

      INSERT INTO "User" VALUES ('USR-001');
      INSERT INTO "Equipment" ("id", "type", "totalQuantity", "operationalStatus") VALUES
        ('EQP-001', 'Wireless microphone', 24, 'OPERATIONAL'),
        ('EQP-003', 'Projector (4K)', 8, 'UNDER_MAINTENANCE'),
        ('EQP-004', 'Folding table', 40, 'OUT_OF_SERVICE');
      INSERT INTO "EquipmentStatusChange" VALUES
        ('ESC-001', 'EQP-003', 'OPERATIONAL', 'UNDER_MAINTENANCE', 'Lamp replacement'),
        ('ESC-002', 'EQP-004', 'OPERATIONAL', 'OUT_OF_SERVICE', 'Broken legs');
    `;

    const file = join(workDir, 'run.sql');
    writeFileSync(file, `${setup}\n${readFileSync(MIGRATION, 'utf8')}`);
    execFileSync('npx', ['prisma', 'db', 'execute', '--file', file, '--url', process.env.DATABASE_URL!], {
      stdio: 'pipe',
    });

    for (const row of await q(
      `SELECT "id", "totalQuantity", "operationalStatus"::TEXT AS "operationalStatus",
              "damagedQuantity", "maintenanceQuantity" FROM ${SCHEMA}."Equipment"`,
    )) {
      items[row.id] = row;
    }
    history = await prisma.$queryRawUnsafe(
      `SELECT "id", "quantity" FROM ${SCHEMA}."EquipmentStatusChange" ORDER BY "id"`,
    );
  }, 60_000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await prisma.$disconnect();
    rmSync(workDir, { recursive: true, force: true });
  });

  it('US-45: an item in working order starts with 0 damaged and 0 under maintenance', () => {
    expect(items['EQP-001']).toMatchObject({ damagedQuantity: 0, maintenanceQuantity: 0, operationalStatus: 'OPERATIONAL' });
  });

  it('US-45: an item damaged as a whole keeps all its units damaged', () => {
    expect(items['EQP-004']).toMatchObject({ damagedQuantity: 40, maintenanceQuantity: 0, operationalStatus: 'OUT_OF_SERVICE' });
  });

  it('US-45: an item under maintenance as a whole keeps all its units under maintenance', () => {
    expect(items['EQP-003']).toMatchObject({ damagedQuantity: 0, maintenanceQuantity: 8, operationalStatus: 'UNDER_MAINTENANCE' });
  });

  it('US-45 AC-2: history recorded before counts existed carries the whole item', () => {
    expect(history).toEqual([
      { id: 'ESC-001', quantity: 8 },
      { id: 'ESC-002', quantity: 40 },
    ]);
  });

  describe('the derived status, after the migration', () => {
    const update = (set: string, id = 'EQP-001') =>
      prisma.$executeRawUnsafe(`UPDATE ${SCHEMA}."Equipment" SET ${set} WHERE "id" = '${id}'`);
    const read = async (id = 'EQP-001') =>
      (
        await q(
          `SELECT "id", "totalQuantity", "operationalStatus"::TEXT AS "operationalStatus",
                  "damagedQuantity", "maintenanceQuantity" FROM ${SCHEMA}."Equipment" WHERE "id" = '${id}'`,
        )
      )[0];

    it('US-45: follows the counts — available while any unit works', async () => {
      await update(`"damagedQuantity" = 2`);
      expect(await read()).toMatchObject({ operationalStatus: 'OPERATIONAL', damagedQuantity: 2 });
      await update(`"damagedQuantity" = 0`);
    });

    it('US-45: an older status-only write is read as the whole item, as before', async () => {
      await update(`"operationalStatus" = 'UNDER_MAINTENANCE'`);
      expect(await read()).toMatchObject({ damagedQuantity: 0, maintenanceQuantity: 24 });
      await update(`"operationalStatus" = 'OPERATIONAL'`);
      expect(await read()).toMatchObject({ damagedQuantity: 0, maintenanceQuantity: 0 });
    });

    it('US-45: refuses counts below zero or over the total', async () => {
      await expect(update(`"damagedQuantity" = -1`)).rejects.toThrow();
      await expect(update(`"damagedQuantity" = 20, "maintenanceQuantity" = 5`)).rejects.toThrow();
    });
  });
});
