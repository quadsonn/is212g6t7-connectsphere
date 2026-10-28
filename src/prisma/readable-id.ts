import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Readable, prefixed IDs — the team's convention (CLAUDE.md, "IDs"): a table's
 * own prefix, a dash and a number zero-padded to 3 digits, e.g. VEN-053. Past
 * 999 the number simply grows: VEN-1000.
 *
 * The database issues them: every table's `id` defaults to
 * next_readable_id('<PREFIX>') (migration 20261019100000_readable_ids_all_models),
 * so every insert gets one — application code, nested and bulk creates,
 * upserts, seeds, scripts, tests and raw SQL alike. Code never passes an `id`.
 *
 * A new model must add its prefix here and in its schema default
 * (`@default(dbgenerated("next_readable_id('XYZ'::text)"))`); a unit test
 * checks the two agree for every model.
 */
export const ID_PREFIX = {
  User: 'USR',
  EventRequest: 'EVT',
  Venue: 'VEN',
  VenueBooking: 'BKG',
  BookingDecision: 'BDC',
  VenueBlock: 'BLK',
  Equipment: 'EQP',
  EquipmentSuggestion: 'ESG',
  EquipmentReservation: 'RSV',
  EquipmentRequirement: 'REQ',
  EventChange: 'CHG',
  EventChangeRequest: 'CRQ',
  EventChangeRequestEquipment: 'CRE',
  Registration: 'REG',
  Notification: 'NTF',
  BookingSuggestion: 'BSG',
  EquipmentStatusChange: 'ESC',
  RevokedToken: 'RVT',
  ClarificationMessage: 'CLM',
  SafetyReview: 'SFR',
} as const;

export type ReadableIdModel = keyof typeof ID_PREFIX;

/** Digits the number is zero-padded to. Past 999 it simply grows: BSG-1000. */
const PAD = 3;

/** e.g. ("BSG", 7) → "BSG-007". The same format next_readable_id() writes. */
export function formatReadableId(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(PAD, '0')}`;
}

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * The next ID for `model`, for code that needs one before inserting. Inserts
 * do not need this — the column default issues the ID — but it asks the same
 * database function, so the two can never hand out the same number.
 */
export async function nextReadableId(db: Db, model: ReadableIdModel): Promise<string> {
  const [{ id }] = await db.$queryRaw<{ id: string }[]>`
    SELECT next_readable_id(${ID_PREFIX[model]}) AS id`;
  return id;
}

const READABLE = /^([A-Z]+)-(\d+)$/;

/**
 * Orders readable IDs by prefix, then by number — REQ-999 before REQ-1000,
 * which plain text order gets wrong. Anything else falls back to text order.
 */
export function compareReadableIds(a: string, b: string): number {
  const ma = READABLE.exec(a);
  const mb = READABLE.exec(b);
  if (!ma || !mb || ma[1] !== mb[1]) return a < b ? -1 : a > b ? 1 : 0;
  return Number(ma[2]) - Number(mb[2]);
}

/**
 * Rows in the order they were entered: oldest first, and within one save
 * (rows sharing a createdAt) by ID number, which the database issues in
 * insert order. A query's `orderBy: { id }` cannot do this past 999.
 */
export function inEntryOrder<T extends EntryRow>(rows: readonly T[]): T[];
export function inEntryOrder<T extends EntryRow>(rows: readonly T[] | null | undefined): T[] | null | undefined;
export function inEntryOrder<T extends EntryRow>(rows: readonly T[] | null | undefined) {
  // A read that did not include the rows has nothing to order.
  if (!rows) return rows;
  return [...rows].sort(
    (a, b) => time(a) - time(b) || compareReadableIds(a.id, b.id),
  );
}

type EntryRow = { createdAt?: Date | null; id: string };

const time = (row: EntryRow) => row.createdAt?.getTime() ?? 0;
