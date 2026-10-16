import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';

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
  });
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
