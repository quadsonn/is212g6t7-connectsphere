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
| `base-venues.sql` | 4 venues (3 published, 1 draft), all managed by `USR-010`. Load after `base-users.sql`. | Venue specs, once converted |
| `tc-s1-01-setup.sql` | 1 SUBMITTED request, `EVT-146`, assigned to `USR-004` | TC-S1-01, 03, 05, 06, 09–14, 16, 17, 19–22 (US-07/08/09), 43 (US-05) |
| `tc-s1-02-setup.sql` | 12 requests covering every review state (see below) | TC-S1-02, 04, 08 (US-07/08), plus status-variant tests in the US-07/08/09 specs |
| `tc-s1-22-setup.sql` | A second Organiser, `USR-007` / other@example.com | TC-S1-22, 30, 38, 46 |
| `tc-s1-39-setup.sql` | 12 requests of USR-006's, one per status, named "Request <STATUS>" | TC-S1-39 (US-05 AC-1) |
| `tc-s1-41-setup.sql` | 2 REJECTED requests with reasons | TC-S1-41 (US-05 AC-2) |
| `tc-s1-42-setup.sql` | 3 drafts: plain, returned with a question, and one asked about attendance | TC-S1-42 (US-05 AC-3) |
| `tc-s1-45-setup.sql` | 1 APPROVED request | TC-S1-45 (US-05 AC-4) |
| `tc-s1-46-setup.sql` | 1 request of USR-006's and 2 of USR-007's. Load after `tc-s1-22-setup`. | TC-S1-46 (US-05 AC-5) |
| `tc-s1-54-setup.sql` | 1 SUBMITTED request with layout and accessibility, assigned to `USR-004` | TC-S1-54 (US-06 AC-6). Not yet loaded; linked when `events-coordinator-view` is converted (group 3). |

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
| `tc-s2-12-setup.sql` | one confirmed booking on Main Hall in March 2027 | 12 |
| `tc-s2-13-setup.sql` | a heavily booked February 2027 on Main Hall, for the "loads within 2 seconds" check. Every day has three confirmed slots and three pending requests (168 bookings). Confirmed slots never overlap, since the database refuses overlapping APPROVED bookings (Story 23 constraint) | 13 |
| `tc-s2-14-setup.sql` | on Main Hall in March 2027, a confirmed booking on the 10th and a pending request on the 12th, both for an event whose name and organiser the Coordinator's calendar must never reveal | 14 |
| `tc-s2-15-setup.sql` | on Main Hall in March 2027, a pending request on the 12th and a rejected request on the 14th, and nothing confirmed | 15 |
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
| `tc-s2-31-setup.sql` | an event the venue clearly doesn't suit, so the suitability check flags it before a booking request is submitted | 31 |
| `tc-s2-33-setup.sql` | events the requesting Coordinator must NOT be able to check: another Coordinator's, an unassigned one, and inactive ones | 33 |
| `tc-s2-34-setup.sql` | an APPROVED event assigned to USR-004, with layout, accessibility and equipment requirements recorded, ready to have Main Hall requested for it | 34, 35, 36, 37, 38, 39, 40 |
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
| `tc-s2-83-setup.sql` | an event in planning, assigned to USR-004, ready to be handed to another Coordinator | 83, 84, 85, 86, 87, 88 |
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
