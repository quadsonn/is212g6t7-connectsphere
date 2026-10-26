/**
 * Keeps the integration suite away from every database except a local test
 * one. The shared Supabase database must never be reset, migrated or seeded
 * by a test run.
 *
 * Two layers:
 *  - assertSafeTestDatabaseUrl(): checks the URL before anything connects
 *    (used by e2e-setup.ts before createdb/migrate, and by e2e-env.ts).
 *  - assertConnectedToTestDatabase(): asks the server itself where we are,
 *    so a helper that deletes or writes data refuses to run even if the URL
 *    check was bypassed.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/** Loopback server addresses, as reported by inet_server_addr(). */
const LOCAL_ADDRESSES = new Set(['127.0.0.1', '::1']);

export class UnsafeTestDatabaseError extends Error {}

export interface DatabaseTarget {
  host: string;
  database: string;
}

/** Host and database name only — never the credentials. */
export function describeDatabaseUrl(url: string): DatabaseTarget {
  const parsed = new URL(url);
  return { host: parsed.hostname, database: parsed.pathname.replace(/^\//, '') };
}

export function assertSafeTestDatabaseUrl(url: string | undefined): DatabaseTarget {
  if (!url) {
    throw new UnsafeTestDatabaseError('no test database URL is set');
  }

  let target: DatabaseTarget;
  try {
    target = describeDatabaseUrl(url);
  } catch {
    throw new UnsafeTestDatabaseError('the test database URL could not be parsed');
  }

  if (!LOCAL_HOSTS.has(target.host) || !target.database.includes('_test')) {
    throw new UnsafeTestDatabaseError(
      `refusing to run integration tests against ${target.host}/${target.database}: ` +
        'the host must be localhost or 127.0.0.1 and the database name must contain "_test"',
    );
  }

  return target;
}

interface RawQueryClient {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
}

/**
 * Runtime check for helpers that delete or write data. A NULL server address
 * means a Unix-socket connection, which is local by definition.
 *
 * In GitHub Actions the Postgres service container reports its Docker-network
 * address (e.g. 172.18.0.2) rather than loopback, even though the runner
 * reaches it through localhost. The URL check has already pinned the host to
 * localhost there, so the address is accepted; the _test name check still applies.
 */
export async function assertConnectedToTestDatabase(prisma: RawQueryClient): Promise<void> {
  const [row] = await prisma.$queryRawUnsafe<{ db: string; addr: string | null }[]>(
    // host() drops the netmask: ::text would give '::1/128', not '::1'.
    'SELECT current_database() AS db, host(inet_server_addr()) AS addr',
  );

  const inCi = process.env.GITHUB_ACTIONS === 'true';
  const local = row.addr === null || LOCAL_ADDRESSES.has(row.addr) || inCi;
  if (!local || !row.db.includes('_test')) {
    throw new UnsafeTestDatabaseError(
      `refusing to modify database ${row.db} at ${row.addr ?? 'unix socket'}: not a local _test database`,
    );
  }
}
