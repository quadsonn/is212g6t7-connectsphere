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
| `base-venues.sql` | 4 venues (3 published, 1 draft), all managed by `USR-010`. Load after `base-users.sql`. | TC-S1-103 to 111 (US-14, US-15), and the Sprint 2 venue and booking specs |
| `tc-s1-01-setup.sql` | 1 SUBMITTED request, `EVT-146`, assigned to `USR-004` | TC-S1-01, 03, 05, 06, 09–14, 16, 17, 19–22 (US-07/08/09), 43 (US-05) |
| `tc-s1-02-setup.sql` | 12 requests covering every review state (see below) | TC-S1-02, 04, 08 (US-07/08), plus status-variant tests in the US-07/08/09 specs |
| `tc-s1-22-setup.sql` | A second Organiser, `USR-007` / other@example.com | TC-S1-22, 30, 38, 46 |
| `tc-s1-39-setup.sql` | 12 requests of USR-006's, one per status, named "Request <STATUS>" | TC-S1-39 (US-05 AC-1) |
| `tc-s1-41-setup.sql` | 2 REJECTED requests with reasons | TC-S1-41 (US-05 AC-2) |
| `tc-s1-42-setup.sql` | 3 drafts: plain, returned with a question, and one asked about attendance | TC-S1-42 (US-05 AC-3) |
| `tc-s1-45-setup.sql` | 1 APPROVED request | TC-S1-45 (US-05 AC-4) |
| `tc-s1-46-setup.sql` | 1 request of USR-006's and 2 of USR-007's. Load after `tc-s1-22-setup`. | TC-S1-46 (US-05 AC-5) |
| `tc-s1-54-setup.sql` | 1 SUBMITTED request with every detail filled in (layout, accessibility, equipment needs, registration), assigned to `USR-004` | TC-S1-54 (US-06 AC-6), TC-S1-84 to 86 and 94 (US-12) |
| `tc-s1-84-setup.sql` | 3 of USR-006's requests: SUBMITTED and assigned with no optional details, SUBMITTED and unassigned, and an unassigned DRAFT | TC-S1-85, 86 (US-12), TC-S1-90 to 93 (US-10) |
| `tc-s1-25-setup.sql` | The Event Coordinator Lead, `USR-012` / lead@example.com | TC-S1-25 (US-03 AC-2: a new submission reaches the Lead's unassigned queue); TC-S2-83 to 88 (Story 26: the Lead reassigns) |
| `tc-s1-67-setup.sql` | 2 CONFIRMED events (one per Organiser) and 1 draft, with "INTERNAL …" planning notes. Load after `tc-s1-22-setup`. | TC-S1-67 to 75 (US-02), integration and browser tests |
| `tc-s1-96-setup.sql` | A second Venue Staff member, `USR-013` / venue.staff2@example.com, who manages no venues | TC-S1-96 to 111 (US-13 to US-15: drafts and edits are limited to their manager) |
| `tc-s1-105-setup.sql` | 3 bookings on the base venues: upcoming APPROVED on Main Hall, finished on Seminar Room, REJECTED on Rooftop Terrace. Load after `base-venues.sql`. | TC-S1-105, 107 (US-14 AC-3) |

Specs load the `tc-s1-*` scripts per test, in the Arrange step: `await given('tc-s1-01-setup')`. A test can always be traced to exactly the script its test case names. Test-case pre-conditions are in `docs/testing/sprint1-test-cases.md`.

### `base-users.sql`

**Password for all users: `correct-horse-battery-staple`**. It is stored as a pre-computed bcrypt hash (cost 10), so nothing is hashed at test time.

| ID | Email | Name | Role |
|---|---|---|---|
| `USR-006` | organiser@example.com | Olivia Organiser | EVENT_ORGANISER |
| `USR-004` | coord.a@example.com | Cody Coordinator | EVENT_COORDINATOR |
| `USR-005` | coord.b@example.com | Casey Coordinator | EVENT_COORDINATOR |
| `USR-010` | venue.staff@example.com | Vera Venue | VENUE_STAFF |
| `USR-009` | tech.support@example.com | Toby Tech | TECHNICAL_SUPPORT_STAFF |
| `USR-001` | attendee@example.com | Ann Attendee | ATTENDEE |

### `base-venues.sql`

All four are managed by `USR-010`.

| ID | Name | Location | Capacity | Status | Layouts | Accessibility |
|---|---|---|---:|---|---|---|
| `VEN-002` | Main Hall | Block A, Level 1 | 300 | PUBLISHED | THEATRE, BANQUET | STEP_FREE_ACCESS, HEARING_LOOP |
| `VEN-038` | Seminar Room | Block B, Level 3 | 40 | PUBLISHED | CLASSROOM, BOARDROOM, U_SHAPE | STEP_FREE_ACCESS |
| `VEN-004` | Rooftop Terrace | Block C, Roof | 120 | PUBLISHED | EVENT_HALL | none |
| `VEN-001` | Annex (draft) | none | none | DRAFT | none | none |

All rows use the timestamp `2026-09-01 09:00:00`.

### `tc-s1-01-setup.sql`

| ID | Status | Organiser | Coordinator | Key values |
|---|---|---|---|---|
| `EVT-146` | SUBMITTED | `USR-006` | `USR-004` | "Freshman Orientation 2030"; purpose "Welcome new students"; description "Full-day programme with talks and booths"; 2030-10-01 09:00–17:00 UTC; attendance 320 |

### `tc-s1-02-setup.sql`

Every row is raised by `USR-006`. All are assigned to `USR-004` except `EVT-150`. Each uses the same values as `EVT-146`, except the two "-2" rows ("Careers Fair 2030", 2030-11-05, attendance 200). Tests look these rows up by ID. A spec that reads a whole list (for example `GET /events/mine` and `body[0]`) uses `tc-s1-01-setup.sql` instead.

| ID | Status | Extra |
|---|---|---|
| `EVT-146` | SUBMITTED | — |
| `EVT-147` | SUBMITTED | a second, independent request |
| `EVT-004` | DRAFT | — |
| `EVT-151` | UNDER_REVIEW | — |
| `EVT-152` | UNDER_REVIEW | a second, independent request |
| `EVT-001` | APPROVED | — |
| `EVT-009` | REJECTED | no reason recorded |
| `EVT-012` | RETURNED | clarificationRequest "Please confirm the attendance figure" |
| `EVT-003` | CANCELLED | — |
| `EVT-154` | SUBMITTED | clarificationRequest "An earlier question" |
| `EVT-133` | SUBMITTED | clarificationRequest "An earlier question", decisionReason "An earlier rejection" |
| `EVT-150` | SUBMITTED | no coordinator, so it sits in the review pool |

### `tc-s1-22-setup.sql`

| ID | Email | Name | Role |
|---|---|---|---|
| `USR-007` | other@example.com | Otto Organiser | EVENT_ORGANISER |

The password is the same as for the base users.

### US-05 scripts (`tc-s1-39` to `tc-s1-46`)

Every row uses purpose "Purpose", description "Description", category "Conference", 2030-10-01 09:00–17:00 UTC and attendance 100, with no coordinator. Where a list test reads `body[0]`, the intended row has the newest `createdAt`, and that is noted in each script.

| Script | ID | Owner | Status | Name | Extra |
|---|---|---|---|---|---|
| `tc-s1-39` | `EVT-134` to `EVT-145` (statuses in alphabetical order), plus `EVT-155` (AWAITING_SAFETY_CHECK) and `EVT-156` (SAFETY_REJECTED): 14 rows | USR-006 | each EventStatus | "Request <STATUS>" | Add a row if a status is added (e.g. Change 6) |
| `tc-s1-41` | `EVT-011` (newest) | USR-006 | REJECTED | Seeded request | reason "Clashes with the examination period" |
| | `EVT-010` | USR-006 | REJECTED | Seeded request | reason "Venue capacity insufficient" |
| `tc-s1-42` | `EVT-006` | USR-006 | DRAFT | Plain draft | — |
| | `EVT-007` | USR-006 | DRAFT | Returned for clarification | question "Which venue did you have in mind?" |
| | `EVT-005` (newest) | USR-006 | DRAFT | Seeded request | question "Please confirm the expected attendance figure" |
| `tc-s1-45` | `EVT-002` | USR-006 | APPROVED | Seeded request | — |
| `tc-s1-46` | `EVT-008` | USR-006 | DRAFT | Mine | — |
| | `EVT-148` | USR-007 | DRAFT | Theirs | — |
| | `EVT-149` | USR-007 | REJECTED | Theirs | reason "CONFIDENTIAL internal note" |

### `tc-s1-54-setup.sql`

| ID | Status | Organiser | Coordinator | Key values |
|---|---|---|---|---|
| `EVT-153` | SUBMITTED | `USR-006` | `USR-004` | Layout THEATRE, notes "Centre aisle, front row reserved". Accessibility STEP_FREE_ACCESS and HEARING_LOOP, notes "Ramp access to the stage". Equipment "Six wireless microphones, two projectors". Registration enabled. Attendance 320. |

### `tc-s1-25-setup.sql`

| ID | Email | Name | Role |
|---|---|---|---|
| `USR-012` | lead@example.com | Leah Lead | EVENT_COORDINATOR_LEAD |

### `tc-s1-67-setup.sql`

| ID | Status | Organiser | Coordinator | Key values |
|---|---|---|---|---|
| `EVT-160` | CONFIRMED | `USR-006` | `USR-004` | "Event owned by A"; 1 Oct 2030 09:00–17:00 UTC; registration open 1 Jan 2026 – 28 Sep 2030; layout notes, accessibility notes and equipment needs all start "INTERNAL" |
| `EVT-161` | CONFIRMED | `USR-007` | `USR-005` | "Event owned by B"; same dates and notes |
| `EVT-162` | DRAFT | `USR-006` | none | "Unreviewed draft"; same notes, registration window not set |

None has a venue booking, so Venue Staff (RELATED scope) see none of them.

### `tc-s1-84-setup.sql`

| ID | Status | Organiser | Coordinator | Key values |
|---|---|---|---|---|
| `EVT-163` | SUBMITTED | `USR-006` | `USR-004` | "Bare request": no equipment needs, accessibility or notes; registration off |
| `EVT-164` | SUBMITTED | `USR-006` | none | "Waiting for the Lead": in the Lead's unassigned queue |
| `EVT-165` | DRAFT | `USR-006` | none | "Unfinished draft" |

### `tc-s1-96-setup.sql`

| ID | Email | Name | Role |
|---|---|---|---|
| `USR-013` | venue.staff2@example.com | Vince Venue | VENUE_STAFF |

### `tc-s1-105-setup.sql`

Every event is `USR-006`'s and assigned to `USR-004`. Times are UTC.

| Booking | Venue | Event | Slot | Status | Why |
|---|---|---|---|---|---|
| `BKG-001` | `VEN-002` Main Hall | `EVT-166` "Orientation", APPROVED, 250 | 2030-10-01 08:00–18:00 | APPROVED | Upcoming: an edit that reduces Main Hall must warn |
| `BKG-002` | `VEN-038` Seminar Room | `EVT-167` "Past seminar", COMPLETED, 30 | 2020-01-01 08:00–18:00 | APPROVED | Finished: must not count |
| `BKG-003` | `VEN-004` Rooftop Terrace | `EVT-168` "Rejected party", APPROVED, 100 | 2030-10-02 18:00–23:00 | REJECTED | Rejected: must not count |

## Browser tests (Playwright)

The browser tests in `e2e/` load the same scripts through `e2e/support/db.ts` (`given('base-users', ...)`), which calls the same `resetDb` and `loadSql`. `playwright.config.ts` points the API it starts at the test database and refuses anything that isn't a local `_test` database.

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
- IDs must be readable IDs with the table's prefix from `ID_PREFIX` in `src/prisma/readable-id.ts` (`USR-012`, `EVT-155`). A CHECK constraint refuses anything else. Pick numbers no other script uses for that table. `loadSql` moves each ID counter past the highest fixture ID afterwards, so rows the app creates during the test never collide with them.
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

## Sprint 2 scripts (`tc-s2-*`)

Added for the Sprint 2 test cases ([docs/testing/sprint2-test-cases.md](../../docs/testing/sprint2-test-cases.md)). Each script's header lists every row it creates and what to load before it. They add rows only; `base-users.sql` and `base-venues.sql` are unchanged.

| Script | Creates | Used by (TC-S2-) |
|---|---|---|
| `tc-s2-01-setup.sql` | a second Venue Staff member with one published venue | 01, 02, 05, 08, 40, 41, 48, 60 |
| `tc-s2-02-setup.sql` | one booking of each status on Main Hall, one booking on another staff member's venue, and one blocked period on Seminar Room | 02 |
| `tc-s2-04-setup.sql` | two confirmed bookings on Main Hall, two and a half weeks apart, so each calendar window can be shown to include or exclude them | 04 |
| `tc-s2-05-setup.sql` | one confirmed booking on each of two of USR-010's venues, and one on another staff member's venue, all on the same day | 05 |
| `tc-s2-06-setup.sql` | one confirmed booking on Main Hall, with attendance and an organiser, so its slot's details can be checked | 06 |
| `tc-s2-07-setup.sql` | one pending booking request on Main Hall, to be approved, reversed or rejected through the API during the test | 07 |
| `tc-s2-09-setup.sql` | on Main Hall on 2 October, one confirmed booking and one pending request at different times, plus an approved event with no booking yet. The test then blocks out the whole day | 09 |
| `tc-s2-10-setup.sql` | a confirmed booking on Main Hall **today** (10:00-12:00 Singapore time) and a blocked period on Seminar Room today, dated with `now()` because the Venue Staff calendar opens on today. The only Sprint 2 script whose dates move | 10, 11 (browser tests) |
| `tc-s2-12-setup.sql` | one confirmed booking on Main Hall in March 2027 | 12 |
| `tc-s2-13-setup.sql` | a heavily booked February 2027 on Main Hall, for the "loads within 2 seconds" check. Every day has three confirmed slots and three pending requests (168 bookings). Confirmed slots never overlap, since the database refuses overlapping APPROVED bookings (Story 23 constraint) | 13 |
| `tc-s2-14-setup.sql` | on Main Hall in March 2027, a confirmed booking on the 10th and a pending request on the 12th, both for an event whose name and organiser the Coordinator's calendar must never reveal | 14 |
| `tc-s2-15-setup.sql` | on Main Hall in March 2027, a pending request on the 12th and a rejected request on the 14th, and nothing confirmed | 15 |
| `tc-s2-182-setup.sql` | four blocked-off periods in March 2027: part of a day, three whole days and the morning of 10 Mar on Main Hall, and one on Seminar Room. Their reason must never reach a Coordinator | 182, 183 |
| `tc-s2-18-setup.sql` | two published venues and one draft that matches every filter | 18 |
| `tc-s2-19-setup.sql` | venues around one slot, 10 Mar 2027 09:00-17:00 Singapore time (01:00-09:00 UTC) | 19 |
| `tc-s2-20-setup.sql` | two venues either side of a minimum-capacity boundary | 20 |
| `tc-s2-21-setup.sql` | two venues differing in one accessibility feature | 21 |
| `tc-s2-22-setup.sql` | two venues differing in one facility | 22 |
| `tc-s2-23-setup.sql` | five venues, each failing exactly one filter except Match | 23 |
| `tc-s2-24-setup.sql` | venues for the name lookup, one of them a draft | 24 |
| `tc-s2-26-setup.sql` | a realistic catalogue for the "within 2 seconds" check: 300 venues (every 10th a draft) and 600 bookings around 10 Mar 2027 | 26 |
| `tc-s2-28-setup.sql` | one venue and one event that fits it on every check, plus a draft venue | 28, 29, 30, 31, 32, 33 |
| `tc-s2-29-setup.sql` | an event that fails capacity by one and needs an accessibility feature the venue lacks | 29 |
| `tc-s2-30-setup.sql` | a venue with a projector and microphones; events needing facilities it does and doesn't have; and one event per equipment scenario (free, held by another event, its own reservation, only a pending request elsewhere, under maintenance, free text), each with its own catalogue item. Load after `tc-s2-28-setup.sql` | 30, 184 |
| `tc-s2-31-setup.sql` | an event the venue clearly doesn't suit, so the suitability check flags it before a booking request is submitted | 31 |
| `tc-s2-33-setup.sql` | events the requesting Coordinator must NOT be able to check: another Coordinator's, an unassigned one, and inactive ones | 33 |
| `tc-s2-34-setup.sql` | an APPROVED event assigned to USR-004, with layout, accessibility and equipment requirements recorded, ready to have Main Hall requested for it | 34, 35, 36, 37, 38, 39, 40 |
| `tc-s2-35-setup.sql` | a copy of Orientation with equipment lines (one from the catalogue, one free text), technical support and required facilities; and a request made before requests carried them. Load after `tc-s2-34-setup.sql` | 35 |
| `tc-s2-36-setup.sql` | a CONFIRMED booking on Main Hall overlapping the 09:00-12:00 slot | 36 |
| `tc-s2-37-setup.sql` | a CONFIRMED booking on Main Hall starting exactly when the 09:00-12:00 slot ends | 37 |
| `tc-s2-38-setup.sql` | a PENDING request on Main Hall overlapping the 09:00-12:00 slot | 38 |
| `tc-s2-40-setup.sql` | an event that has only been SUBMITTED, so no venue may be requested for it yet | 40 |
| `tc-s2-41-setup.sql` | a pending and an approved request on my venue, and a pending one on another staff member's | 41 |
| `tc-s2-42-setup.sql` | one pending request with every detail a reviewer needs | 42, 46 |
| `tc-s2-43-setup.sql` | two pending requests whose event order and submission order are opposite, so each sort is distinguishable | 43 |
| `tc-s2-44-setup.sql` | requests on two venues, at different dates and in every status, for the filters | 44, 47 |
| `tc-s2-45-setup.sql` | pending requests far away, near (3 days), and already started (-1 day) | 45 |
| `tc-s2-47-setup.sql` | two pending requests, to be approved and rejected through the API | 47 |
| `tc-s2-48-setup.sql` | one pending request on Main Hall, waiting for a Venue Staff decision | 48, 49, 50, 51, 52, 53, 54, 58, 59, 60, 61, 64 |
| `tc-s2-52-setup.sql` | a second Event Organiser, unrelated to any Sprint 2 event | 52 |
| `tc-s2-55-setup.sql` | two pending requests on Main Hall whose times overlap, so only one can ever be approved | 53, 55, 57, 62, 63, 64 |
| `tc-s2-56-setup.sql` | five venues, each with a pending request and one confirmed booking in a different position against it (touching before, touching after, one-minute overlap, inside, covering) | 56 |
| `tc-s2-57-setup.sql` | a pending request on Main Hall with a confirmed, a pending and a rejected booking overlapping it | 57 |
| `tc-s2-58-setup.sql` | a blocked-out period on Main Hall overlapping the tc-s2-48 request | 58 |
| `tc-s2-61-setup.sql` | a confirmed booking on Main Hall overlapping the tc-s2-48 request | 61, 64 |
| `tc-s2-64-setup.sql` | back-to-back confirmed bookings and two identical pending ones, which the no-overlap constraint must allow | 64 |
| `tc-s2-68-setup.sql` | an event in planning, assigned to USR-004, with nothing booked or changed yet | 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 89, 90, 91, 92, 93, 94, 95, 96 |
| `tc-s2-70-setup.sql` | two events assigned to USR-004 that are not in planning (one under review, one approved) | 70, 92 |
| `tc-s2-71-setup.sql` | an approved Main Hall booking for the tc-s2-68 event | 71, 72, 73, 74 |
| `tc-s2-72-setup.sql` | a projector in the catalogue and an approved reservation of it for the tc-s2-68 event | 72 |
| `tc-s2-73-setup.sql` | a Main Hall booking for the tc-s2-68 event, still only requested | 73 |
| `tc-s2-74-setup.sql` | a projector and a requested reservation for the tc-s2-68 event, plus an unrelated event in planning | 74, 94 |
| `tc-s2-76-setup.sql` | three recorded changes to the tc-s2-68 event, stored out of date order | 76 |
| `tc-s2-77-setup.sql` | a request returned to its Organiser for changes | 77 |
| `tc-s2-83-setup.sql` | an event in planning, assigned to USR-004, ready to be handed to another Coordinator (by the Lead, from `tc-s1-25-setup.sql`) | 83, 84, 85, 86, 87, 88 |
| `tc-s2-84-setup.sql` | a completed event, still assigned to USR-004 | 84 |
| `tc-s2-94-setup.sql` | three more events in planning with nothing recorded, for Technical Support's list | 94 |
| `tc-s2-95-setup.sql` | an event in planning that is open for registration, so an Attendee can view it | 95 |
| `tc-s2-97-setup.sql` | a small equipment catalogue: three items, one under maintenance, one with no description or location | 97, 98, 99, 100, 101 |
| `tc-s2-103-setup.sql` | four equipment items, one in each operational status (two operational), and an event to reserve against | 103, 104, 105, 106, 107, 108, 109, 110, 111, 112 |
| `tc-s2-106-setup.sql` | confirmed reservations overlapping the 09:00-17:00 window: 10 microphones from 12:00, and 4 of 6 PA systems | 106, 111, 112 |
| `tc-s2-107-setup.sql` | confirmed microphone reservations outside the window, two of them back-to-back with it | 107 |
| `tc-s2-108-setup.sql` | microphone reservations over the window that hold nothing: requested, rejected and released | 108 |
| `tc-s2-109-setup.sql` | two confirmed microphone reservations inside the window that never overlap each other | 109 |
| `tc-s2-114-setup.sql` | one event per mix of the three requirement sources (Organiser needs, Coordinator rows, support notes), one with none, and a draft with all three | 114, 115, 116, 117, 118, 119 |
| `tc-s2-117-setup.sql` | an event whose equipment and support text is only spaces | 117 |
| `tc-s2-122-setup.sql` | three equipment items (one under maintenance) and four events: the main one, one overlapping it, one back-to-back, one the next day | 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134 |
| `tc-s2-123-setup.sql` | events equipment must not be committed to: draft, rejected, cancelled, completed | 123 |
| `tc-s2-129-setup.sql` | a submitted event with no Coordinator assigned | 129 |
| `tc-s2-130-setup.sql` | a pending and a rejected reservation for the main event | 130 |
| `tc-s2-134-setup.sql` | a reservation for the main event already released on 1 Jan 2030 | 134 |
| `tc-s2-136-setup.sql` | a confirmed event open for registration now (capacity 100) | 136, 137, 138, 139, 140, 141, 142, 143 |
| `tc-s2-137-setup.sql` | events where registering is not allowed: registration off, still planning, draft, not yet open, already closed | 137, 141 |
| `tc-s2-142-setup.sql` | two more Attendees, a full event (2 of 2) and one with a single place left | 142, 145, 146, 147, 148, 149, 151, 152, 153, 154, 155, 156, 157 |
| `tc-s2-145-setup.sql` | USR-001's registrations: one active (venue confirmed), one withdrawn (no venue) | 145, 146, 148 |
| `tc-s2-151-setup.sql` | USR-001's registrations before and after their withdrawal cutoff, and one already withdrawn | 151, 152, 153, 154, 155, 156, 157 |
| `tc-s2-159-setup.sql` | an equipment catalogue and a submitted event with catalogue and free-text equipment | 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 172, 173, 174, 175, 176, 177, 178, 179, 180 |
| `tc-s2-169-setup.sql` | USR-006's events in every status a change request is or isn't allowed for | 169 |
| `tc-s2-170-setup.sql` | a second Organiser (USR-008) and their own submitted event | 170 |
| `tc-s2-172-setup.sql` | pending change requests on USR-004's and USR-005's events, one already decided, and a Main Hall booking | 172, 173, 174, 175, 176, 177, 178, 179, 180 |
| `tc-s2-178-setup.sql` | a pending request to change an event's equipment list | 178 |

Extra users added by Sprint 2 scripts (same password as the base users):

| ID | Email | Name | Role |
|---|---|---|---|
| `USR-011` | venue.staff.b@example.com | Victor Venue | VENUE_STAFF (`tc-s2-01-setup.sql`) |
| `USR-008` | other.organiser@example.com | Oscar Organiser | EVENT_ORGANISER (`tc-s2-52-setup.sql`, and again in `tc-s2-170-setup.sql`; never load both) |
| `USR-002` | attendee.b@example.com | Bea Attendee | ATTENDEE (`tc-s2-142-setup.sql`) |
| `USR-003` | attendee.c@example.com | Cal Attendee | ATTENDEE (`tc-s2-142-setup.sql`) |

## Sprint 3 scripts

Named after the first Sprint 3 test case that needs them; a second script for the same test case gets a letter (`tc-s3-55b`). See [sprint3-test-cases.md](../../../docs/testing/sprint3-test-cases.md)). Load after `base-users.sql` and `base-venues.sql`. Sprint 3 numbers continue after the highest ID any earlier script uses for that table.

| Script | Creates | Used by (TC-S3-) |
|---|---|---|
| `tc-s3-38-setup.sql` | `EVT-191` "Harbour Gala" in PLANNING with Main Hall approved (`BKG-074`); Ann and Rita Registered, Walt Withdrawn (`REG-009` to `REG-011`); `CRQ-006` pending, moving it to 2 Oct 2030 09:00–18:00 Singapore time | 38, 41, 42, 43, 45 |
| `tc-s3-39-setup.sql` | `EVT-192` "Riverside Fair": Rooftop Terrace approved (`BKG-075`), Main Hall approved then reversed to REJECTED (`BKG-076`, decisions `BDC-001`, `BDC-002`), Seminar Room requested in its place (`BKG-077`); Ann Registered (`REG-012`) | 39, 44 |
| `tc-s3-40-setup.sql` | `EVT-193` "Lakeside Talk": Main Hall approved and flagged as needing a replacement (`BKG-078`); Ann Registered (`REG-013`) | 40 |
| `tc-s3-54-setup.sql` | A second Venue Staff member, Sam (`USR-016`), managing East Annex (`VEN-039`); Old Gym (`VEN-040`) managed by nobody; "Gala" (`EVT-194`) in PLANNING, 1 Oct 2030 18:00–22:00 UTC | 54 to 58, 62 (every test in `us40-venue-notifications`) |
| `tc-s3-55-setup.sql` | Main Hall APPROVED for the Gala (`BKG-079`). After `tc-s3-54`. | 55, 56, 62 |
| `tc-s3-55b-setup.sql` | Main Hall REQUESTED for the Gala (`BKG-080`). After `tc-s3-54`. | 55, 57 |
| `tc-s3-56-setup.sql` | East Annex REJECTED for the Gala (`BKG-081`). After `tc-s3-55`. | 56 |
| `tc-s3-59-setup.sql` | A Safety Officer, Sophie (`USR-017`), and "gala" (`EVT-195`) in PLANNING. After `base-users` and `tc-s1-25-setup` (the Lead). | Every test in `notifications` (59, 60, 61, 67) |
| `tc-s3-59b-setup.sql` | One notice about the gala for each of seven roles (`NTF-001` to `NTF-007`) | 59 |
| `tc-s3-60-setup.sql` | Two unread notices for Vera, one for Sam (`NTF-008` to `NTF-010`). After `tc-s3-54`. | 60 |
| `tc-s3-60b-setup.sql` | One unread notice for Olivia (`NTF-011`). After `tc-s3-59`. | 60, 61 |
| `tc-s3-60c-setup.sql` | Three unread notices for Olivia, an hour apart (`NTF-012` to `NTF-014`). After `tc-s3-59`. | 60 |
| `tc-s3-61-setup.sql` | Five notices for Vera, "m1" (newest) to "m5" (`NTF-015` to `NTF-019`) | 61 |
| `tc-s3-61b-setup.sql` | Two notices for Olivia and one for Cody, an hour apart (`NTF-020` to `NTF-022`). After `tc-s3-59`. | 60, 61 |
| `tc-s3-67-setup.sql` | Cody's notice of a rejected booking with a suggested alternative (`NTF-023`). After `tc-s3-59`. | 67 |
| `tc-s3-63-setup.sql` | Story 41 base, loaded alone after `base-users` (no `base-venues`): Olly (`USR-018`, a second Venue Staff member), mainHall (`VEN-041`, 200, managed by Vera) and eastHall (`VEN-042`, 100, step-free, theatre, Olly's), the "Showcase" (`EVT-196`) and its REQUESTED mainHall booking `BKG-082` | Every test in `bookings-suggestions` (63 to 69) |
| `tc-s3-63b-setup.sql` | Updates `BKG-082` to APPROVED. After `tc-s3-63`. | 63, 66 |
| `tc-s3-63c-setup.sql` | westHall (`VEN-043`, 150, step-free). After `tc-s3-63`. | 63, 69 |
| `tc-s3-64-setup.sql` | A venue catalogue (`VEN-044` to `VEN-055`) where only bigHall, flatHall and pendingHall also fit; other events' bookings (`EVT-197` to `EVT-199`, `BKG-083` to `BKG-085`) and a block (`BLK-005`). After `tc-s3-63`. | 64, 65, 66 |
| `tc-s3-64b-setup.sql` | Makes mainHall step-free with a theatre layout. After `tc-s3-63`. | 64 |
| `tc-s3-64c-setup.sql` | eastHall booked 07:00–09:00 for another event (`EVT-200`, `BKG-086`). After `tc-s3-63`. | 64 |
| `tc-s3-64d-setup.sql` | eastHall cut to 40; seminarRoom (`VEN-056`, 60). After `tc-s3-63`. | 64 |
| `tc-s3-66-setup.sql` | eastHall APPROVED for another event 10:00–11:00 (`EVT-201`, `BKG-087`). After `tc-s3-63`. | 66, 68 |
| `tc-s3-66b-setup.sql` | eastHall blocked 08:00–10:00 (`BLK-006`). After `tc-s3-63`. | 66 |
| `tc-s3-66c-setup.sql` | A REQUESTED booking of eastHall for another event (`EVT-202`, `BKG-088`). After `tc-s3-63`. | 66 |
| `tc-s3-68b-setup.sql` | eastHall cut to 50 (loaded after the rejection). After `tc-s3-63`. | 68 |
| `tc-s3-68c-setup.sql` | Two rejected Showcase requests with a suggestion each: one whose slot has started (`BKG-095`), one with no attendance (`BKG-096`); decisions `BDC-003`/`BDC-004`, suggestions `BSG-001`/`BSG-002`. After `tc-s3-63`. | 68 |
| `tc-s3-70-setup.sql` | Story 42 base: "Graduation showcase" (`EVT-203`) in PLANNING, 1 Nov 2030 10:00–14:00 UTC; Hall A, Room 2, Annex (`VEN-057` to `VEN-059`); Projector (`EQP-013`, 10) | Every test in `events-confirm` and `e2e/us42-confirm.spec.ts` (70 to 74) |
| `tc-s3-70b-setup.sql` | Hall A APPROVED (`BKG-089`). After `tc-s3-70`. | 70, 71, 72, 73, 74 |
| `tc-s3-70c-setup.sql` | Room 2 REQUESTED (`BKG-092`). After `tc-s3-70b`. | 70 |
| `tc-s3-70d-setup.sql` | Room 2 APPROVED (`BKG-093`), Annex REJECTED (`BKG-094`). After `tc-s3-70b`. | 70 |
| `tc-s3-70e-setup.sql` | 2 × Projector needed (`REQ-010`), 2 only REQUESTED (`RSV-017`). After `tc-s3-70b`. | 70 |
| `tc-s3-70f-setup.sql` | 2 × Projector needed (`REQ-012`), 2 APPROVED (`RSV-018`). After `tc-s3-70b`. | 70 |
| `tc-s3-71-setup.sql` | Hall A only REQUESTED (`BKG-090`). After `tc-s3-70`. | 71 |
| `tc-s3-71b-setup.sql` | Room 2 APPROVED but flagged for review (`BKG-091`). After `tc-s3-70`. | 71 |
| `tc-s3-71c-setup.sql` | 2 × Projector needed (`REQ-009`), 1 APPROVED (`RSV-016`). After `tc-s3-70`. | 71 |
| `tc-s3-71d-setup.sql` | A free-text line, "Stage lighting rig" (`REQ-011`). After `tc-s3-70`. | 70, 71, 72 |
| `tc-s3-71e-setup.sql` | A second event (`EVT-204`) with its own free-text line (`REQ-013`). After `tc-s3-70`. | 71 |
| `tc-s3-73b-setup.sql` | Updates `EVT-203` to AWAITING_ARRANGEMENTS. After `tc-s3-70`. | 73 |
| `tc-s3-73c-setup.sql` | Updates `EVT-203` to APPROVED. After `tc-s3-70`. | 73 |
| `tc-s3-75-setup.sql` | Story 43: "Autumn Festival" (`EVT-205`) with Main Hall and Rooftop Terrace approved, a hold on Seminar Room, 2 PA systems (`EQP-014`, `RSV-019`), a pending change request (`CRQ-007`), Ann Registered and Wendy (`USR-019`) Withdrawn. After `base-users` + `base-venues`. | 75 to 82 |
| `tc-s3-75b-setup.sql` | Olivia's events that cannot be cancelled: draft, rejected, completed, cancelled, already started (`EVT-206` to `EVT-210`) | 75 |
| `tc-s3-83-setup.sql` | Story 44: "Other" (`EVT-211`) and "Next" (`EVT-212`). After `tc-s3-54`. | 83 to 87 |
| `tc-s3-83b-setup.sql` | The Gala's pending, held, approved and rejected Main Hall bookings (`BKG-100` to `BKG-103`) | 83, 85 |
| `tc-s3-83c-setup.sql` | "Other"'s pending Main Hall booking (`BKG-104`) | 85 |
| `tc-s3-83d-setup.sql` | The Gala's approved Main Hall booking, flagged for review (`BKG-105`) | 83 |
| `tc-s3-83e-setup.sql` | 2 wireless microphones reserved for the Gala (`EQP-015`, `RSV-020`) | 83 |
| `tc-s3-86-setup.sql` | The Gala's pending East Annex booking (`BKG-106`). After `tc-s3-55`. | 86 |
| `tc-s3-87-setup.sql` | "Other"'s approved Main Hall booking 08:00–12:00 (`BKG-107`). After `tc-s3-55`. | 87 |
| `tc-s3-87b-setup.sql` | Main Hall with 30-minute buffers; the Gala and "Other" flagged for clashing within them (`BKG-108`, `BKG-109`) | 87 |
| `tc-s3-88-setup.sql` | Story 45: Wireless microphone (`EQP-016`, 10) and "Conference" (`EVT-213`). After `base-users`. | 88 to 94 |
| `tc-s3-93-setup.sql` | "Later" and "Sooner" with upcoming microphone reservations (`EVT-214`, `EVT-215`, `RSV-021`, `RSV-022`) | 93 |
| `tc-s3-93b-setup.sql` | Reservations the warning leaves out: released, rejected, past, another item (`EVT-216`, `EQP-017`, `RSV-023` to `RSV-026`) | 93 |
| `tc-s3-93c-setup.sql` | 2 microphones approved for the Conference (`RSV-027`) | 93, 94 |
| `tc-s3-99-setup.sql` | Story 46: Attendees a1 to a8 (`USR-020` to `USR-027`). After `base-users`. Dates in the Story 46 scripts are fixed against a frozen "now" of 1 Mar 2030. | 99 to 106 |
| `tc-s3-99b-setup.sql` | An event for each period and capacity case (`EVT-217` to `EVT-228`) | 99 to 104, 106 |
| `tc-s3-99c-setup.sql` | Browse list: open, full, closed, not yet open (`EVT-229` to `EVT-232`) | Story 33 browse test (kept) |
| `tc-s3-99d-setup.sql` | Browse list: mine, planning, registration off, started, visible (`EVT-233` to `EVT-237`) | Story 33 browse test (kept) |
| `tc-s3-107-setup.sql` | Story 47: "gala" (`EVT-238`) with a hold, an approved and a rejected booking and two projector reservations; "next" and "bystander" (`EVT-247`, `EVT-248`); hallA–C (`VEN-060` to `VEN-062`); Projector (`EQP-018`). After `base-users`. | 107 to 112 |
| `tc-s3-107b-setup.sql` | An "other" event in each status (`EVT-239` to `EVT-246`) | 110 |
| `tc-s3-113-setup.sql` | A confirmed event with a venue and equipment, and a rival event | 113 to 123 |
| `tc-s3-113b-setup.sql` | A pending change request (CRQ-008): the default request: move conf to 2 Oct | 113 to 115, 117 to 123 |
| `tc-s3-114-setup.sql` | Rival has mainHall at the new time | 114, 120 to 123 |
| `tc-s3-114b-setup.sql` | A pending change request (CRQ-009): move conf to 2 Oct with 250 attending | 114 |
| `tc-s3-114c-setup.sql` | Rival has mainHall just before the new time, inside its buffers | 114 |
| `tc-s3-114d-setup.sql` | MainHall is blocked out on the new day | 114 |
| `tc-s3-114e-setup.sql` | Conf also has annex, which rival holds at the new time | 114, 116 |
| `tc-s3-115-setup.sql` | A pending change request (CRQ-010): move conf to 2 Oct and add 8 microphones | 115 |
| `tc-s3-115b-setup.sql` | A pending change request (CRQ-011): move conf to 2 Oct and add 1 brokenCamera | 115 |
| `tc-s3-115c-setup.sql` | A pending change request (CRQ-012): move conf to 2 Oct and change to 6 projectors | 115 |
| `tc-s3-115d-setup.sql` | Rival holds 4 projectors at the new time | 115 |
| `tc-s3-116-setup.sql` | A pending change request (CRQ-013): move conf to 2 Oct and add 2 microphones | 116 |
| `tc-s3-119-setup.sql` | A pending change request (CRQ-014): move conf to 2 Oct with 120 attending | 119 |
| `tc-s3-119b-setup.sql` | A pending change request (CRQ-015): change only the attendance, to 300 | 119 |
| `tc-s3-119c-setup.sql` | An event with no arrangements, and a request to move it | 119 |
| `tc-s3-120-setup.sql` | A pending change request (CRQ-017): move conf to 2 Oct with 999 attending | 120, 122 |
| `tc-s3-120b-setup.sql` | Rival holds 5 projectors at the new time | 120, 122 |
| `tc-s3-120c-setup.sql` | Rival's clashing mainHall booking is released (loaded mid-test) | 120, 121 |
| `tc-s3-124-setup.sql` | A published venue saved without any buffer values | 124 to 129, 135 to 140 |
| `tc-s3-124b-setup.sql` | The Sandbox Auditorium is still a draft | 124, 128 |
| `tc-s3-126-setup.sql` | The Sandbox Auditorium already has 10-minute buffers | 126 |
| `tc-s3-129-setup.sql` | A booking stored with an already-padded window, to check | 129 |
| `tc-s3-130-setup.sql` | A venue with the customer's buffers, one with none, and two events | 130 to 134 |
| `tc-s3-130b-setup.sql` | "existing" has only requested hall 10:00-12:00 | 132, 134 |
| `tc-s3-130c-setup.sql` | "existing" has hall 15:00-15:45 (23:00-23:45 Singapore time), turnaround past midnight | 130, 132 |
| `tc-s3-130d-setup.sql` | "existing" has plain 15:00-15:45 | 130 |
| `tc-s3-130e-setup.sql` | Hall without buffers yet, holding two back-to-back approved bookings | 131 |
| `tc-s3-130f-setup.sql` | Another venue, where "newEvent" has a pending request 12:15-13:00 | 131 |
| `tc-s3-130g-setup.sql` | Hall gets 60-minute setup and turnaround (the click-through scenario) | 130, 131, 133, 134 |
| `tc-s3-130h-setup.sql` | "existing" has hall 19:00-23:30 (the click-through evening booking) | 131, 133, 134 |
| `tc-s3-130i-setup.sql` | "existing" has plain 19:00-23:30 | 134 |
| `tc-s3-130j-setup.sql` | A venue saved without buffers, with the evening booking | 133 |
| `tc-s3-130k-setup.sql` | "existing" has hall 11:00-15:30 (19:00-23:30 Singapore time) | 130 |
| `tc-s3-130l-setup.sql` | Hall's buffers explicitly set back to 0 and 0 | 133 |
| `tc-s3-131-setup.sql` | "existing" has hall 10:00-12:00 (occupying 09:30-12:45) | 131, 132, 134 |
| `tc-s3-131b-setup.sql` | "newEvent" requested hall 12:30-13:30, inside the turnaround of tc-s3-131's booking | 131 |
| `tc-s3-131c-setup.sql` | Hall is blocked out 12:00-12:30 for cleaning | 131 |
| `tc-s3-133-setup.sql` | "existing" has plain 10:00-12:00 | 131, 133, 134 |
| `tc-s3-135-setup.sql` | The customer's example: two approved bookings that clash only once 30/45 buffers apply | 137 to 140 |
| `tc-s3-135b-setup.sql` | Two bookings whose padded windows only touch | 137 |
| `tc-s3-135c-setup.sql` | A single approved booking, to check the overlap rule against | 135 |
| `tc-s3-136-setup.sql` | The customer's pair, but in the past (1 Jan 2020) | 136 |
| `tc-s3-136b-setup.sql` | The morning lecture, and a rejected talk at lunchtime | 135 |
| `tc-s3-136c-setup.sql` | The customer's pair with the morning lecture only requested | 135, 138 |
| `tc-s3-136d-setup.sql` | The customer's pair, on a different venue | 135 |
| `tc-s3-138b-setup.sql` | An afternoon seminar that also clashes with the lunch talk under 30/45 | 138 |
| `tc-s3-141-setup.sql` | An approved booking at a venue that is about to become unavailable, and a venue for its replacement | 141 to 145 |
| `tc-s3-141b-setup.sql` | A pending and a rejected request for mainHall over the same slot | 141 |
| `tc-s3-141c-setup.sql` | Bookings outside the unavailable period, or at another venue | 141 |
| `tc-s3-142-setup.sql` | Another Coordinator's event, booked at eastHall | 141 |
| `tc-s3-142b-setup.sql` | An event with no Coordinator, with a pending mainHall request | 141 |
| `tc-s3-143b-setup.sql` | A second event of the same Coordinator | 143 |
| `tc-s3-145-setup.sql` | A third venue, for a second replacement attempt | 145 |
| `tc-s3-145b-setup.sql` | Showcase also holds eastHall for an afternoon breakout session | 145 |
| `tc-s3-146-setup.sql` | An event in planning, and three venues with two managers | 146 to 151 |
| `tc-s3-148-setup.sql` | Another event holds breakoutA in the afternoon | 148 |
| `tc-s3-152-setup.sql` | Two venues with different managers, and an event in planning | 152 to 158 |
| `tc-s3-152b-setup.sql` | A draft, which cannot be held for | 152 |
| `tc-s3-152c-setup.sql` | The Gala's technical requirements (Story 20 AC-2) | 152 |
| `tc-s3-152d-setup.sql` | Main Hall is taken back to draft | 152 |
| `tc-s3-153-setup.sql` | A submitted event, not yet at a planning stage | 153 |
| `tc-s3-154-setup.sql` | A second event in planning, competing for Main Hall | 154 to 158 |
| `tc-s3-154b-setup.sql` | The Gala has Main Hall confirmed | 154, 156 |
| `tc-s3-154c-setup.sql` | The Gala has a pending request for Main Hall | 154 |
| `tc-s3-155-setup.sql` | A pending morning request for Main Hall | 155 |
| `tc-s3-157-setup.sql` | A hold on Main Hall that expired an hour ago and was never released | 156, 157 |
| `tc-s3-157b-setup.sql` | A live morning hold on Main Hall | 154, 157 |
| `tc-s3-157c-setup.sql` | A pending request inside the live morning hold | 154 |
| `tc-s3-158-setup.sql` | An event in planning with no Coordinator yet | 158 |
| `tc-s3-159-setup.sql` | The people of the Coordinator Lead workflow | 159 to 176 |
| `tc-s3-159b-setup.sql` | A draft, and a request already assigned to Marcus | 159, 163 |
| `tc-s3-160-setup.sql` | One request waiting in the unassigned queue | 160 to 167, 170, 174 |
| `tc-s3-161-setup.sql` | Three queued requests submitted a month apart | 161 |
| `tc-s3-162-setup.sql` | The queued request's layout | 162 |
| `tc-s3-162b-setup.sql` | The request has left the queue (Marcus has it) | 162 |
| `tc-s3-168-setup.sql` | Marcus's events, active and closed, and one still queued | 168 |
| `tc-s3-169-setup.sql` | One active event each for Marcus and Fatima | 169, 176 |
| `tc-s3-170-setup.sql` | An event in planning, assigned to Marcus | 170, 172, 173, 175, 176 |
| `tc-s3-171-setup.sql` | Marcus's closed events | 171 |
| `tc-s3-173-setup.sql` | What an event carries when it is reassigned | 173 |
| `tc-s3-177-setup.sql` | Two Safety Officers, a venue with restrictions, microphones, and an event in planning | 177 to 186 |
| `tc-s3-177b-setup.sql` | A pending request for Main Hall | 177 |
| `tc-s3-177c-setup.sql` | A second pending request for Main Hall, on another day | 177, 185 |
| `tc-s3-177d-setup.sql` | The event needs 4 microphones (none reserved yet) | 177 |
| `tc-s3-177e-setup.sql` | Main Hall approved for the Careers Fair, so it is ready to confirm | 177 to 186 |
| `tc-s3-177f-setup.sql` | A second event, ready to confirm | 177 |
| `tc-s3-177g-setup.sql` | The microphones are released while the event waits for its check | 177 |
| `tc-s3-178-setup.sql` | 2 microphones requested and reserved for the Careers Fair | 177, 178, 182 |
| `tc-s3-178b-setup.sql` | A block on Main Hall during the booked slot | 178 |
| `tc-s3-185-setup.sql` | The event is cancelled while safety feedback waits for an answer | 185 |

Extra users added by Sprint 3 scripts (same password as the base users):

| ID | Email | Name | Role |
|---|---|---|---|
| `USR-014` | rita@example.com | Rita Registered | ATTENDEE (`tc-s3-38-setup.sql`) |
| `USR-015` | walt@example.com | Walt Withdrawn | ATTENDEE (`tc-s3-38-setup.sql`) |
| `USR-016` | sam.staff@example.com | Sam Staff | VENUE_STAFF (`tc-s3-54-setup.sql`) |
| `USR-017` | safety@example.com | Sophie Safety | SAFETY_OFFICER (`tc-s3-59-setup.sql`) |
| `USR-018` | other.staff@example.com | Olly Other | VENUE_STAFF (`tc-s3-63-setup.sql`) |
| `USR-019` | wendy@example.com | Wendy Withdrawn | ATTENDEE (`tc-s3-75-setup.sql`) |
| `USR-020` to `USR-027` | a1@example.com to a8@example.com | a1 to a8 | ATTENDEE (`tc-s3-99-setup.sql`) |
| `USR-028` | olive@example.com | Olive (Acme Corp) | EVENT_ORGANISER (`tc-s3-159-setup.sql`) |
| `USR-029` | lena@example.com | Lena | EVENT_COORDINATOR_LEAD (`tc-s3-159-setup.sql`) |
| `USR-030` | marcus@example.com | Marcus | EVENT_COORDINATOR (`tc-s3-159-setup.sql`) |
| `USR-031` | fatima@example.com | Fatima | EVENT_COORDINATOR (`tc-s3-159-setup.sql`) |
| `USR-032` | venue@example.com | Vic | VENUE_STAFF (`tc-s3-159-setup.sql`) |
| `USR-033` | sam.officer@example.com | Sam | SAFETY_OFFICER (`tc-s3-177-setup.sql`) |
| `USR-034` | mei.officer@example.com | Mei | SAFETY_OFFICER (`tc-s3-177-setup.sql`) |

`tc-s3-159-setup.sql` is loaded **instead of** `base-users.sql` (Stories 55 and 56 need exactly two Coordinators). `tc-s3-177-setup.sql` must not be loaded with another script that adds a Safety Officer (such as `tc-s3-59-setup.sql`).
