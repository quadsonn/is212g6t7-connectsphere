# Test-DB setup scripts

Plain-SQL setup scripts for the integration tests (`test/*.e2e-spec.ts`). They run against the local test database, `connectsphere_test`, and never against the shared Supabase database.

Every integration test that uses these scripts starts the same way:

1. `resetDb(prisma)` (`test/helpers/reset-db.ts`) empties every application table with one `TRUNCATE … RESTART IDENTITY CASCADE`. The table list comes from `information_schema`; only `_prisma_migrations` is kept.
2. `loadSql(prisma, '<script>')` (`test/helpers/load-sql.ts`) runs the script named in the test case's pre-condition: "Run test/fixtures/sql/<script>.sql on testDB (reset before test)".

Both helpers check that they are connected to a local `_test` database before writing anything (`SELECT current_database(), host(inet_server_addr())`), and throw otherwise.

## Scripts

| Script | Creates | Used by |
|---|---|---|
| `base-users.sql` | 6 users: one per Sprint 1 role, with two Coordinators | Every converted spec (`beforeEach`) |
| `base-venues.sql` | 4 venues (3 published, 1 draft), all managed by `u-venue-staff`. Load after `base-users.sql`. | Venue specs, once converted |
| `tc-s1-01-setup.sql` | 1 SUBMITTED request, `e-submitted`, assigned to `u-coordinator-a` | TC-S1-01, 03, 05, 06, 09–14, 16, 17, 19–22 (US-07/08/09), 43 (US-05) |
| `tc-s1-02-setup.sql` | 12 requests covering every review state (see below) | TC-S1-02, 04, 08 (US-07/08), plus status-variant tests in the US-07/08/09 specs |
| `tc-s1-22-setup.sql` | A second Organiser, `u-organiser-2` / other@example.com | TC-S1-22, 30, 38, 46 |
| `tc-s1-39-setup.sql` | 12 requests of u-organiser's, one per status, named "Request <STATUS>" | TC-S1-39 (US-05 AC-1) |
| `tc-s1-41-setup.sql` | 2 REJECTED requests with reasons | TC-S1-41 (US-05 AC-2) |
| `tc-s1-42-setup.sql` | 3 drafts: plain, returned with a question, and one asked about attendance | TC-S1-42 (US-05 AC-3) |
| `tc-s1-45-setup.sql` | 1 APPROVED request | TC-S1-45 (US-05 AC-4) |
| `tc-s1-46-setup.sql` | 1 request of u-organiser's and 2 of u-organiser-2's. Load after `tc-s1-22-setup`. | TC-S1-46 (US-05 AC-5) |
| `tc-s1-54-setup.sql` | 1 SUBMITTED request with layout and accessibility, assigned to `u-coordinator-a` | TC-S1-54 (US-06 AC-6). Not yet loaded; linked when `events-coordinator-view` is converted (group 3). |

Specs load the `tc-s1-*` scripts per test, in the Arrange step: `await given('tc-s1-01-setup')`. A test can always be traced to exactly the script its test case names. Test-case pre-conditions are in `docs/testing/sprint1-test-cases.md`.

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

### `tc-s1-01-setup.sql`

| ID | Status | Organiser | Coordinator | Key values |
|---|---|---|---|---|
| `e-submitted` | SUBMITTED | `u-organiser` | `u-coordinator-a` | "Freshman Orientation 2030"; purpose "Welcome new students"; description "Full-day programme with talks and booths"; 2030-10-01 09:00–17:00 UTC; attendance 320 |

### `tc-s1-02-setup.sql`

Every row is raised by `u-organiser`. All are assigned to `u-coordinator-a` except `e-unassigned`. Each uses the same values as `e-submitted`, except the two "-2" rows ("Careers Fair 2030", 2030-11-05, attendance 200). Tests look these rows up by ID. A spec that reads a whole list (for example `GET /events/mine` and `body[0]`) uses `tc-s1-01-setup.sql` instead.

| ID | Status | Extra |
|---|---|---|
| `e-submitted` | SUBMITTED | — |
| `e-submitted-2` | SUBMITTED | a second, independent request |
| `e-draft` | DRAFT | — |
| `e-under-review` | UNDER_REVIEW | — |
| `e-under-review-2` | UNDER_REVIEW | a second, independent request |
| `e-approved` | APPROVED | — |
| `e-rejected` | REJECTED | no reason recorded |
| `e-returned` | RETURNED | clarificationRequest "Please confirm the attendance figure" |
| `e-cancelled` | CANCELLED | — |
| `e-with-question` | SUBMITTED | clarificationRequest "An earlier question" |
| `e-stale` | SUBMITTED | clarificationRequest "An earlier question", decisionReason "An earlier rejection" |
| `e-unassigned` | SUBMITTED | no coordinator, so it sits in the review pool |

### `tc-s1-22-setup.sql`

| ID | Email | Name | Role |
|---|---|---|---|
| `u-organiser-2` | other@example.com | Otto Organiser | EVENT_ORGANISER |

The password is the same as for the base users.

### US-05 scripts (`tc-s1-39` to `tc-s1-46`)

Every row uses purpose "Purpose", description "Description", category "Conference", 2030-10-01 09:00–17:00 UTC and attendance 100, with no coordinator. Where a list test reads `body[0]`, the intended row has the newest `createdAt`, and that is noted in each script.

| Script | ID | Owner | Status | Name | Extra |
|---|---|---|---|---|---|
| `tc-s1-39` | `e-status-<status>` (12 rows) | u-organiser | each EventStatus | "Request <STATUS>" | Add a row if a status is added (e.g. Change 6) |
| `tc-s1-41` | `e-rejected-latest` (newest) | u-organiser | REJECTED | Seeded request | reason "Clashes with the examination period" |
| | `e-rejected-direct` | u-organiser | REJECTED | Seeded request | reason "Venue capacity insufficient" |
| `tc-s1-42` | `e-draft-plain` | u-organiser | DRAFT | Plain draft | — |
| | `e-draft-returned` | u-organiser | DRAFT | Returned for clarification | question "Which venue did you have in mind?" |
| | `e-draft-asked` (newest) | u-organiser | DRAFT | Seeded request | question "Please confirm the expected attendance figure" |
| `tc-s1-45` | `e-approved-only` | u-organiser | APPROVED | Seeded request | — |
| `tc-s1-46` | `e-mine` | u-organiser | DRAFT | Mine | — |
| | `e-theirs` | u-organiser-2 | DRAFT | Theirs | — |
| | `e-theirs-rejected` | u-organiser-2 | REJECTED | Theirs | reason "CONFIDENTIAL internal note" |

### `tc-s1-54-setup.sql`

| ID | Status | Organiser | Coordinator | Key values |
|---|---|---|---|---|
| `e-with-preferences` | SUBMITTED | `u-organiser` | `u-coordinator-a` | Layout THEATRE, notes "Centre aisle, front row reserved". Accessibility STEP_FREE_ACCESS and HEARING_LOOP, notes "Ramp access to the stage". Equipment "Six wireless microphones, two projectors". Registration enabled. Attendance 320. |

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
