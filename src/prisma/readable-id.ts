import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Readable, prefixed IDs — the team's convention (CLAUDE.md, "IDs"): a table's
 * own prefix, a dash and a number zero-padded to 3 digits, e.g. BSG-001.
 *
 * The one generator for every table that uses them. To move another model
 * over, add its prefix here, drop `@default(cuid())` from its `id`, and create
 * its rows with `nextReadableId`.
 */
export const ID_PREFIX = {
  BookingSuggestion: 'BSG',
  EquipmentStatusChange: 'ESC',
} as const;

export type ReadableIdModel = keyof typeof ID_PREFIX;

/** Digits the number is zero-padded to. Past 999 it simply grows: BSG-1000. */
const PAD = 3;

/** e.g. ("BSG", 7) → "BSG-007". */
export function formatReadableId(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(PAD, '0')}`;
}

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * The next ID for `model`, from its counter in IdCounter.
 *
 * One atomic statement: two concurrent callers can never get the same number.
 * Inside a transaction the counter row stays locked until it commits, and a
 * rollback gives the number back, so IDs have no gaps from failed writes.
 */
export async function nextReadableId(db: Db, model: ReadableIdModel): Promise<string> {
  const [ids] = await nextReadableIds(db, model, 1);
  return ids;
}

/** `count` consecutive IDs for `model`, in one statement — for createMany. */
export async function nextReadableIds(
  db: Db,
  model: ReadableIdModel,
  count: number,
): Promise<string[]> {
  if (count < 1) return [];
  const prefix = ID_PREFIX[model];

  const [{ last }] = await db.$queryRaw<{ last: number }[]>`
    INSERT INTO "IdCounter" ("prefix", "last") VALUES (${prefix}, ${count})
    ON CONFLICT ("prefix") DO UPDATE SET "last" = "IdCounter"."last" + ${count}
    RETURNING "last"`;

  return Array.from({ length: count }, (_, i) => formatReadableId(prefix, last - count + 1 + i));
}
