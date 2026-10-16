# Test-DB setup scripts

Plain-SQL setup scripts for the integration tests (`test/*.e2e-spec.ts`). They run against the local test database, `connectsphere_test`, and never against the shared Supabase database.

Every integration test that uses these scripts starts the same way:

1. `resetDb(prisma)` (`test/helpers/reset-db.ts`) empties every application table with one `TRUNCATE … RESTART IDENTITY CASCADE`. The table list comes from `information_schema`; only `_prisma_migrations` is kept.
2. `loadSql(prisma, '<script>')` (`test/helpers/load-sql.ts`) runs the script named in the test case's pre-condition: "Run test/fixtures/sql/<script>.sql on testDB (reset before test)".

Both helpers check that they are connected to a local `_test` database before writing anything (`SELECT current_database(), host(inet_server_addr())`), and throw otherwise.

## Scripts

| Script | Creates | Used by |
|---|---|---|
| `base-users.sql` | 6 users: one per Sprint 1 role, with two Coordinators | `test/events-review.e2e-spec.ts` (pilot) |
| `base-venues.sql` | 4 venues (3 published, 1 draft), all managed by `u-venue-staff`. Load after `base-users.sql`. | Venue specs, once converted |

### `base-users.sql`

**Password for all users: `correct-horse-battery-staple`**. It is stored as a pre-computed bcrypt hash (cost 10), so nothing is hashed at test time.

| ID | Email | Name | Role |
|---|---|---|---|
| `u-organiser` | organiser@example.com | Olivia Organiser | EVENT_ORGANISER |
| `u-coordinator-a` | coord.a@example.com | Cody Coordinator | EVENT_COORDINATOR |
| `u-coordinator-b` | coord.b@example.com | Casey Coordinator | EVENT_COORDINATOR |
| `u-venue-staff` | venue.staff@example.com | Vera Venue | VENUE_STAFF |
| `u-tech-support` | tech.support@example.com | Toby Tech | TECHNICAL_SUPPORT_STAFF |
| `u-attendee` | attendee@example.com | Ann Attendee | ATTENDEE |

### `base-venues.sql`

All four are managed by `u-venue-staff`.

| ID | Name | Location | Capacity | Status | Layouts | Accessibility |
|---|---|---|---:|---|---|---|
| `v-main-hall` | Main Hall | Block A, Level 1 | 300 | PUBLISHED | THEATRE, BANQUET | STEP_FREE_ACCESS, HEARING_LOOP |
| `v-seminar-room` | Seminar Room | Block B, Level 3 | 40 | PUBLISHED | CLASSROOM, BOARDROOM, U_SHAPE | STEP_FREE_ACCESS |
| `v-rooftop` | Rooftop Terrace | Block C, Roof | 120 | PUBLISHED | EVENT_HALL | none |
| `v-draft-annex` | Annex (draft) | none | none | DRAFT | none | none |

All rows use the timestamp `2026-09-01 09:00:00`.

## Loading a script by hand

Use the test database only. The URL is `TEST_DATABASE_URL` from `.env`, without the `?schema=public` suffix.

```bash
psql "postgresql://<user>@localhost:5432/connectsphere_test" -v ON_ERROR_STOP=1 -f test/fixtures/sql/base-users.sql
```

Scripts only insert, so load them into an empty database. To empty it first from psql:

```sql
DO $reset$
DECLARE list text;
BEGIN
  SELECT string_agg(format('%I.%I', table_schema, table_name), ', ') INTO list
    FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations';
  EXECUTE 'TRUNCATE TABLE ' || list || ' RESTART IDENTITY CASCADE';
END $reset$;
```

## Writing a new script

- Name it `tc-s1-XX-setup.sql`, after the test case that needs it.
- Load it after `base-users` (and `base-venues` if it needs the catalogue), and reuse the base IDs rather than inventing new users.
- Use fixed IDs, dates and values. Don't use `now()`, random values or `gen_random_uuid()`.
- Quote table and column names exactly as Prisma creates them (`"EventRequest"`, `"organiserId"`), and cast enums (`'SUBMITTED'::"EventStatus"`).
- `updatedAt` has no database default, so set it explicitly.
- Write plain SQL only. `loadSql` splits on top-level semicolons, ignoring any inside strings, comments or `$$` bodies. psql meta-commands such as `\i` are not supported.

## Why PostgreSQL, not in-memory SQLite

The course brief suggests an in-memory SQLite test database. Ours has to be PostgreSQL because the schema relies on features SQLite does not have:

- **Native enum types** (`CREATE TYPE … AS ENUM`): 14 of them, used for roles, statuses, layouts and more.
- **Enum arrays**, such as a venue's `facilities` or `supportedLayouts` (`"Facility"[]`). Prisma does not support list columns on SQLite.
- **The `EXCLUDE USING gist` constraint** that stops two approved bookings overlapping on the same venue (`btree_gist`, `tstzrange`).
- **GIN indexes** for venue search over those arrays.
- **Advisory and row locks** (`pg_advisory_xact_lock`, `SELECT … FOR UPDATE`) that serialise bookings, reservations and registrations.
- **Case-insensitive name search** (`mode: 'insensitive'`), which Prisma does not support on SQLite.

Running the tests on SQLite would mean testing a different schema from the one we ship. A dedicated, local PostgreSQL database, reset before every test, gives the same isolation as a fresh in-memory database while still testing the real constraints.
