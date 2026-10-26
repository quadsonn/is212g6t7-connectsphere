import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Prisma, PrismaClient } from '@prisma/client';

import { ID_PREFIX } from '../../src/prisma/readable-id';
import { assertConnectedToTestDatabase } from './db-guard';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sql');

/**
 * Runs test/fixtures/sql/<name>.sql on the test database — the same file a
 * test case's pre-condition names, so the documented setup and the executed
 * setup cannot drift apart.
 *
 * Prisma's $executeRawUnsafe sends one statement per call, so the file is
 * split first (see splitSqlStatements). All statements run in one
 * transaction: a script either loads completely or not at all.
 *
 * Scripts must be plain SQL — psql meta-commands such as \i are not supported.
 *
 * Scripts insert fixed readable IDs (USR-006, EVT-146), which bypass the
 * next_readable_id() default, so each ID counter is then moved up to the
 * highest ID in its table (syncIdCounters). The next row the app inserts gets
 * the number after it instead of colliding with a fixture row.
 */
export async function loadSql(prisma: PrismaClient, name: string): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error(`invalid setup script name: ${name}`);
  }

  await assertConnectedToTestDatabase(prisma);

  const statements = splitSqlStatements(readFileSync(join(FIXTURES_DIR, `${name}.sql`), 'utf8'));

  await prisma.$transaction(async (tx) => {
    for (const statement of statements) {
      await tx.$executeRawUnsafe(statement);
    }
    await syncIdCounters(tx);
  });
}

/**
 * Starts each table's IdCounter after the highest readable ID in it — the
 * same rule the readable-IDs migration (20261019100000) applies to existing
 * rows. GREATEST means a counter only ever moves up, so loading a second
 * script never rewinds it. A table with no rows keeps no counter row.
 */
async function syncIdCounters(tx: Prisma.TransactionClient): Promise<void> {
  for (const [table, prefix] of Object.entries(ID_PREFIX)) {
    const pattern = `^${prefix}-([0-9]+)$`;
    await tx.$executeRawUnsafe(
      `INSERT INTO "IdCounter" ("prefix", "last")
       SELECT $1::text, max(substring(id FROM $2::text)::int) FROM "${table}" WHERE id ~ $2::text
       HAVING max(substring(id FROM $2::text)::int) IS NOT NULL
       ON CONFLICT ("prefix") DO UPDATE SET "last" = GREATEST("IdCounter"."last", EXCLUDED."last")`,
      prefix,
      pattern,
    );
  }
}

/**
 * Splits a SQL script on top-level semicolons only. A semicolon inside a
 * string ('…', E'…'), a quoted identifier ("…"), a comment (-- or /* *\/,
 * nestable as in PostgreSQL) or a dollar-quoted body ($$…$$, $tag$…$tag$) is
 * part of the statement, not a separator. Comment-only fragments are dropped.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let i = 0;

  const push = (end: number) => {
    const text = sql.slice(start, end).trim();
    const withoutComments = text.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (withoutComments) {
      statements.push(text);
    }
  };

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === '-' && next === '-') {
      const eol = sql.indexOf('\n', i);
      i = eol === -1 ? sql.length : eol + 1;
    } else if (ch === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth += 1;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
    } else if (ch === "'") {
      const escapes = /[eE]/.test(sql[i - 1] ?? '') && !/[\w$]/.test(sql[i - 2] ?? '');
      i += 1;
      while (i < sql.length) {
        if (escapes && sql[i] === '\\') {
          i += 2;
        } else if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
        } else if (sql[i] === "'") {
          i += 1;
          break;
        } else {
          i += 1;
        }
      }
    } else if (ch === '"') {
      const close = sql.indexOf('"', i + 1);
      i = close === -1 ? sql.length : close + 1;
    } else if (ch === '$') {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (tag && !/[\w$]/.test(sql[i - 1] ?? '')) {
        const close = sql.indexOf(tag[0], i + tag[0].length);
        i = close === -1 ? sql.length : close + tag[0].length;
      } else {
        i += 1;
      }
    } else if (ch === ';') {
      push(i);
      i += 1;
      start = i;
    } else {
      i += 1;
    }
  }

  push(sql.length);
  return statements;
}
