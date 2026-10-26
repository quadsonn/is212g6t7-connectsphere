# Sprint 2 test cases

Written test cases for the Sprint 2 user stories (Story 16 to 37), traced from story → acceptance criterion → test case → automated test. Stories appear in the order of the Sprint 2 user-story document, and the `US-XX` labels in every test file use its numbers. App code comments and migration folder names still use older labels (see [sprint2-conventions.md](sprint2-conventions.md)).

**Regeneration in progress (2026-10-26).** After the Sprint 3 and Sprint 4 merges, every story is being re-checked against its acceptance criteria, every test is commented with its test case, story/AC and the code it checks, and UI and browser tests are added. Done: **Story 16 to 23**. The rest follow in batches.

US-14 and US-15 were carried over from Sprint 1 and finished in Sprint 2. Their test cases stay in [sprint1-test-cases.md](sprint1-test-cases.md) (TC-S1-103 to 111); their results are reported with Sprint 2.

## How to read this file

- Each test case is one table in the course template. The top part is the test case specification; the bottom part is the test execution record.
- **Pre-conditions** name the exact SQL setup script(s). The automated test loads the same scripts, which is the traceability link. Scripts are in `test/fixtures/sql/` and listed in its [README](../../test/fixtures/sql/README.md). All users share the password `correct-horse-battery-staple`.
- Where a test case has several tests, Pre-conditions list every script any of them loads; a few validation and access tests need only `base-users.sql`.
- **Expected Result** is written from the AC wording, not from the code. Code gaps are noted in Remarks, and each story ends with its AC ↔ code notes.
- **Automated by** gives `<type>: <file>::<exact test name>`. Unit tests are cited by their `describe` block where the whole block serves the test case. Names with `%s` are table-driven (`it.each`), and every row runs.
- **Test case IDs are stable.** TC-S2-01 to TC-S2-181 keep their 18 Oct numbers; new test cases continue from TC-S2-182.
- **Manual** test cases cover what only the user interface can show. The regeneration replaces them with UI and browser tests where it can; any left are run on the app.

**Test types**

| Type | Where | What it runs | Command |
|---|---|---|---|
| **Unit** | `src/**/*.spec.ts` | One service, rule or DTO on its own; Prisma and other dependencies mocked | `npm test` |
| **Integration** (also the functional tests) | `test/*.e2e-spec.ts` | The real Nest app over HTTP (Supertest) and the local `connectsphere_test` database; one `describe` per AC | `npm run test:e2e` |
| **UI** | `frontend/src/**/*.test.tsx` | React screens rendered with React Testing Library and Vitest; the API mocked | `npm --prefix frontend test` |
| **E2E** (browser) | `e2e/*.spec.ts` | Playwright drives Chromium through the real React app, the real API and the local test database | `npm run test:browser` |

All four use only the local test database (or none). None touches the shared Supabase database.

**Legend**

| Value | Meaning |
|---|---|
| Status **Pass** | The automated test ran and the system behaved as expected. |
| Status **Fail** | The system does not yet do what the AC asks (a bug or code gap). Where there is an automated test, it documents current behaviour; `it.failing` marks a bug the test expects to stay failing until it is fixed. |
| Status **Not Executed** | A manual test case not yet run. |
| Status **N/A** | The AC was superseded by a customer clarification; Remarks say where it is recorded. |
| Remarks **Code gap** | Part of the AC is not implemented; the test proves what currently happens. |

---

## Story 16: Venue Availability Calendar (Venue Staff)

### TC-S2-01

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-01 |
| Story/AC ref | Story 16 AC-1 |
| Test Scenario | Venue Staff opens the calendar and sees only the published venues they manage |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-01-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com (Vera Venue). |
| Test Steps | 1. Open the availability calendar for 1-8 Oct 2030 (`GET /calendar`). |
| Test Data | Venues: base-venues (Main Hall, Rooftop Terrace, Seminar Room, Annex draft) and Other Hall (managed by Victor Venue) |
| Expected Result | Main Hall, Rooftop Terrace and Seminar Room are listed. The draft Annex and Other Hall are not. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/calendar.e2e-spec.ts::lists only the published venues I manage`<br>Unit: `src/bookings/calendar.service.spec.ts::CalendarService (US-16) AC-1: my venues, each slot distinguished by status` |

### TC-S2-02

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-02 |
| Story/AC ref | Story 16 AC-1 |
| Test Scenario | Each slot on the calendar is shown by its status: tentatively held, confirmed or blocked |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-01-setup.sql + tc-s2-02-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Open the calendar for 1-8 Oct 2030. |
| Test Data | One pending, one confirmed and one rejected booking on Main Hall; one booking on Other Hall; a "Holiday" block on Seminar Room |
| Expected Result | Entries, in time order: "Pending talk" tentatively held, "Confirmed gala" confirmed, "Holiday" blocked. The rejected booking and the Other Hall booking are not shown. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Available time is the absence of an entry; the screen shades it. Since US-54 a pending request is labelled Pending and a live hold Tentative (the AC's "tentatively held"). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/calendar.e2e-spec.ts::marks pending as pending, approved as confirmed and blocks as blocked`<br>Unit: `src/bookings/calendar.service.spec.ts::CalendarService (US-16) AC-1: my venues, each slot distinguished by status`<br>UI: `frontend/src/features/calendar/calendar-week.test.tsx::US-16 AC-1: a free day is an empty, faintly filled cell with no "Available" text` |

### TC-S2-03

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-03 |
| Story/AC ref | Story 16 Access |
| Test Scenario | Only Venue Staff can open the calendar |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator). |
| Test Steps | 1. Request the calendar as a Coordinator. |
| Test Data | — |
| Expected Result | Access is denied (403). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/calendar.e2e-spec.ts::is denied to a Coordinator (403)` |

### TC-S2-04

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-04 |
| Story/AC ref | Story 16 AC-2 |
| Test Scenario | The calendar returns the right entries for a day, week or month window, and refuses invalid windows |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-04-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Request a week (1-8 Oct), a day (2 Oct), a different day (3 Oct) and a six-week month window.<br>2. Request a window over six weeks, and one that ends before it starts. |
| Test Data | Confirmed bookings "Day two" (2 Oct) and "Next week" (20 Oct) on Main Hall |
| Expected Result | Week and day 2 Oct show only "Day two"; 3 Oct shows nothing; the month window shows both. The oversized and backwards windows are refused (400). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Switching views on screen is TC-S2-10. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/calendar.e2e-spec.ts::only returns entries in the requested window`<br>Integration: `test/calendar.e2e-spec.ts::accepts the exact windows the Day, Week and Month views ask for`<br>Integration: `test/calendar.e2e-spec.ts::excludes an entry from a day it does not touch`<br>Integration: `test/calendar.e2e-spec.ts::rejects a window over six weeks, or one that ends before it starts (400)`<br>Unit: `src/bookings/calendar.service.spec.ts::CalendarService (US-16) AC-2: day, week and month windows` |

### TC-S2-05

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-05 |
| Story/AC ref | Story 16 AC-3 |
| Test Scenario | Filter the calendar to a single venue; another staff member's venue returns nothing |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-01-setup.sql + tc-s2-05-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Filter the calendar to Seminar Room.<br>2. Filter it to Other Hall (not mine). |
| Test Data | Confirmed bookings on Main Hall, Seminar Room and Other Hall, all on 2 Oct 2030 |
| Expected Result | Seminar Room shows only "Room event". Other Hall returns no venues and no entries. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/calendar.e2e-spec.ts::narrows the venues and entries to the chosen venue`<br>Integration: `test/calendar.e2e-spec.ts::returns nothing for a venue I do not manage`<br>Unit: `src/bookings/calendar.service.spec.ts::CalendarService (US-16) AC-3: filter to a single venue`<br>UI: `frontend/src/features/calendar/calendar-week.test.tsx::US-16 AC-3: a venue search box replaces the "starts with" letters`<br>UI: `frontend/src/features/calendar/calendar-week.test.tsx::US-16 AC-3: the search narrows the calendar itself, ignoring case` |

### TC-S2-06

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-06 |
| Story/AC ref | Story 16 AC-4 |
| Test Scenario | A booked slot shows its event details, and opening it shows the full booking |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-06-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Open the calendar for 1-8 Oct.<br>2. Open the "Gala" slot (`GET /bookings/BKG-010`). |
| Test Data | Confirmed booking "Gala", Main Hall, 2 Oct 2030 09:00-12:00 UTC, 80 expected, organised by Olivia Organiser |
| Expected Result | The slot shows event "Gala", organiser Olivia Organiser, 09:00-12:00, 80 expected. Opening it returns the same booking with its event and venue. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/calendar.e2e-spec.ts::includes event name, organiser, time and attendance`<br>Integration: `test/calendar.e2e-spec.ts::opens the full booking for that slot (the click-through)`<br>Unit: `src/bookings/calendar.service.spec.ts::CalendarService (US-16) AC-4: a booked slot carries its event details` |

### TC-S2-07

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-07 |
| Story/AC ref | Story 16 AC-5 |
| Test Scenario | The calendar reflects a booking being confirmed, cancelled or rejected on the next refresh |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-07-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Open the calendar.<br>2. Approve, reverse (cancel) or reject the pending request "Talk".<br>3. Open the calendar again. |
| Test Data | Pending request "Talk", Main Hall, 2 Oct 2030 |
| Expected Result | After approval it shows as confirmed. After it is reversed, or if it is rejected, it no longer appears. The response is marked not to be cached. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/calendar.e2e-spec.ts::shows a booking as confirmed on the next read after it is approved`<br>Integration: `test/calendar.e2e-spec.ts::drops a booking from the calendar on the next read after it is cancelled`<br>Integration: `test/calendar.e2e-spec.ts::shows a rejected request as gone, not tentative` |

### TC-S2-08

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-08 |
| Story/AC ref | Story 16 AC-6 |
| Test Scenario | Venue Staff block out time, which shows as blocked; the block is validated, owner-only and removable |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-01-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com; venue.staff.b@example.com; coord.a@example.com. |
| Test Steps | 1. Block out Main Hall 3 Oct 2030 with reason "Maintenance".<br>2. Try a block with no reason, and one ending before it starts.<br>3. Try to block Other Hall, and to block as a Coordinator.<br>4. Try to remove the block as Victor Venue, then as Vera Venue. |
| Test Data | Reason "Maintenance", 3 Oct 2030 00:00 - 4 Oct 00:00 UTC |
| Expected Result | The block shows as blocked with its reason and "Vera Venue". The invalid blocks are refused (400). Other Hall is not found (404); the Coordinator is refused (403). Only Vera can remove it; afterwards the calendar is empty. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/calendar.e2e-spec.ts::blocks out time, which then appears as BLOCKED`<br>Integration: `test/calendar.e2e-spec.ts::requires a reason and an end after the start (400)`<br>Integration: `test/calendar.e2e-spec.ts::refuses a venue I do not manage (404) and a Coordinator (403)`<br>Integration: `test/calendar.e2e-spec.ts::removes a block`<br>Unit: `src/bookings/calendar.service.spec.ts::CalendarService (US-16) AC-6: blocked-out periods`<br>UI: `frontend/src/pages/venue-calendar.test.tsx::opens a blocked period as "Blocked out", with its reason and who set it` |

### TC-S2-09

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-09 |
| Story/AC ref | Story 16 AC-6 |
| Test Scenario | A new block reports bookings already inside it, and stops new requests and approvals there |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-09-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com; coord.a@example.com. |
| Test Steps | 1. Block out Main Hall for all of 2 Oct 2030.<br>2. Approve the pending request inside it.<br>3. As the Coordinator, request Main Hall at 16:00-18:00 that day. |
| Test Data | Confirmed "Gala" 09:00-12:00 and pending "Pending" 13:00-15:00 on Main Hall, 2 Oct 2030; approved event "New one" with no booking |
| Expected Result | Blocking reports "Gala" as already inside. The approval is refused (409) naming the block; the new request is refused (409). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/calendar.e2e-spec.ts::reports existing bookings inside the new block`<br>Integration: `test/calendar.e2e-spec.ts::stops a Coordinator requesting, and staff approving, inside a block`<br>Unit: `src/bookings/calendar.service.spec.ts::CalendarService (US-16) AC-6: blocked-out periods` |

### TC-S2-10

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-10 |
| Story/AC ref | Story 16 AC-1, AC-2, AC-4, AC-6 (UI) |
| Test Scenario | Switch between Day, Week and Month views, and open a booked slot |
| Pre-conditions | Browser test: run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-10-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com (Vera Venue). UI tests: API mocked. |
| Test Steps | 1. Open Availability calendar.<br>2. Click Day, then Month, then Week.<br>3. Click the booked slot, then close it.<br>4. Click the blocked period. |
| Test Data | `BKG-019` "Gala today" on Main Hall, today 10:00-12:00 (Olivia Organiser, 80 expected); `BLK-001` on Seminar Room, today 14:00-16:00, "Maintenance" |
| Expected Result | Each view shows the booking. Clicking it shows the event name, organiser, time and attendance. The blocked period is drawn and opens as "Blocked out" with its reason and who set it, not as a booking. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | As expected. Each view loaded its own window (1, 7 and a month's days). |
| Status | Pass |
| Remarks | Was manual; now automated by UI and browser tests. The browser test's data is dated relative to today, because the calendar opens on today. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | E2E: `e2e/us16-us19-venues.spec.ts::US-16: Venue Staff switch views, open a booking, and see blocked time apart from bookings`<br>UI: `frontend/src/pages/venue-calendar.test.tsx::switches between Day, Week and Month, loading each one’s window`<br>UI: `frontend/src/pages/venue-calendar.test.tsx::shows the event name, organiser, time and attendance of the clicked booking`<br>UI: `frontend/src/features/calendar/calendar-week.test.tsx::US-16 AC-4: a booking is a pill with a compact time and its name`<br>UI: `frontend/src/features/calendar/calendar-week.test.tsx::US-16 AC-4: hovering a pill shows full time, name and status; click still selects it`<br>UI: `frontend/src/features/calendar/calendar-week.test.tsx::US-16: compact ranges drop leading zeros and on-the-hour minutes`<br>UI: `frontend/src/features/calendar/calendar-week.test.tsx::US-16: free cells stay blank when the Availability filter hides free time`<br>UI: `frontend/src/features/calendar/calendar-week.test.tsx::US-16: the whole current-day column is tinted`<br>UI: `frontend/src/features/calendar/calendar-week.test.tsx::US-16: a long venue name wraps, with a tooltip only when it is cut off`<br>UI: `frontend/src/features/calendar/calendar-week.test.tsx::US-16: Available has no count; the other statuses keep theirs` |

### TC-S2-11

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-11 |
| Story/AC ref | Story 16 AC-7 |
| Test Scenario | Use the calendar on a phone-sized screen |
| Pre-conditions | Browser test at 390 × 844 (a phone): run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-10-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Open Availability calendar.<br>2. Switch to Week, Month and Day.<br>3. Tap the booked slot.<br>4. Check the page doesn't scroll sideways. |
| Test Data | `BKG-019` "Gala today" |
| Expected Result | Every view shows the booking, tapping it opens its details, and nothing overflows the screen. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | As expected; the page was no wider than the screen. |
| Status | Pass |
| Remarks | Was manual; now a browser test at phone size. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | E2E: `e2e/us16-us19-venues.spec.ts::US-16: the calendar works on a phone-sized screen`<br>UI: `frontend/src/features/calendar/calendar-week.test.tsx::US-16: the panel collapses and expands` |

**US-16 AC ↔ code notes**

- **AC-1, "tentatively held":** since US-54 a live hold is Tentative and a pending request is Pending; both are told apart from Confirmed and Blocked (TC-S2-02).
- **AC-2, AC-4, AC-7 (now automated):** the manual test cases TC-S2-10 and 11 are covered by UI tests and browser tests, including one at phone size.

---

## Story 17: View a venue's availability calendar before requesting it (Event Coordinator)

### TC-S2-12

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-12 |
| Story/AC ref | Story 17 AC-1 |
| Test Scenario | A Coordinator opens a venue's calendar: it covers this month and next, shows that venue's bookings only, and isn't cached |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-12-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Open Main Hall's availability with no month given.<br>2. Open March 2027 for Main Hall, then for Seminar Room. |
| Test Data | Confirmed booking on Main Hall, 10 Mar 2027 09:00-17:00 SGT |
| Expected Result | The default range starts on the 1st of this month and ends on the last day of next month, including today. Main Hall shows 10 Mar as booked; Seminar Room shows it free. Responses are not cached. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Blocked-off periods (the code gap noted here on 18 Oct) are now shown; see TC-S2-182. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-availability.e2e-spec.ts::defaults to every day of the current and next month`<br>Integration: `test/venues-availability.e2e-spec.ts::shows existing bookings for that venue`<br>Integration: `test/venues-availability.e2e-spec.ts::ignores another venue's bookings`<br>Integration: `test/venues-availability.e2e-spec.ts::is not cached`<br>Unit: `src/venues/availability.spec.ts::US-17 venue availability aggregation AC-1: every day in the range is reported`<br>Unit: `src/venues/availability.spec.ts::US-17 venue availability aggregation bookings that cross day and month boundaries`<br>Unit: `src/venues/availability.spec.ts::US-17 venue availability aggregation resolveRange`<br>Unit: `src/venues/availability.spec.ts::US-17 venue availability aggregation rangeBounds` |

### TC-S2-182

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-182 |
| Story/AC ref | Story 17 AC-1 |
| Test Scenario | A venue's calendar shows its blocked-off periods: every day a block touches, and the block's hours on the day |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-182-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator). Two tests also load tc-s2-12-setup.sql (a confirmed booking on 10 Mar). |
| Test Steps | 1. Open Main Hall's March 2027 calendar.<br>2. Open Seminar Room's.<br>3. Open Main Hall's hours for 15 Mar, and for 10 Mar (with the booking). |
| Test Data | `BLK-001` Main Hall 15 Mar 09:00-13:00; `BLK-002` Main Hall 20-23 Mar (three whole days); `BLK-003` Main Hall 10 Mar 06:00-08:00; `BLK-004` Seminar Room 25 Mar |
| Expected Result | 15 Mar is blocked and 16 Mar free; 20, 21 and 22 Mar are blocked and 23 Mar free; 10 Mar is blocked even though it also has a booking. Main Hall's 25 Mar is free; Seminar Room's is blocked. 15 Mar's hours list one blocked period, 09:00-13:00; 10 Mar's list the block and then the booking. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | As expected. |
| Status | Pass |
| Remarks | These tests had no test case before the regeneration, and inserted their rows in the test; they now load tc-s2-182-setup.sql. A block outranks a booking on the same day. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-availability.e2e-spec.ts::Given a block on a day, Then that day is blocked`<br>Integration: `test/venues-availability.e2e-spec.ts::Given a block across several days, Then every day it touches is blocked`<br>Integration: `test/venues-availability.e2e-spec.ts::Given a block and an approved booking on the same day, Then the day is blocked`<br>Integration: `test/venues-availability.e2e-spec.ts::ignores another venue's blocks`<br>Integration: `test/venues-availability.e2e-spec.ts::Given a block, Then the day's times list it as a blocked period`<br>Integration: `test/venues-availability.e2e-spec.ts::lists bookings and blocks together, earliest first`<br>Unit: `src/venues/availability.spec.ts::US-17 venue availability aggregation AC-1: blocked-off periods are shown`<br>UI: `frontend/src/features/venues/components/venue-availability-calendar.test.tsx::Given a blocked day, Then it is labelled Blocked and the legend explains it` |

### TC-S2-13

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-13 |
| Story/AC ref | Story 17 AC-2 |
| Test Scenario | A future month loads on its own within 2 seconds, even when heavily booked |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-13-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Open February 2027 for Main Hall (empty, then with 168 bookings).<br>2. Request month 2027-13, and a range over two months. |
| Test Data | tc-s2-13: 3 confirmed + 3 pending bookings every day of Feb 2027 |
| Expected Result | February returns exactly 28 days, in under 2 seconds both times; with the bookings, every day is booked. The invalid month and range are refused (400). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-availability.e2e-spec.ts::returns exactly the requested future month`<br>Integration: `test/venues-availability.e2e-spec.ts::still loads a busy month within two seconds`<br>Integration: `test/venues-availability.e2e-spec.ts::rejects a malformed month`<br>Integration: `test/venues-availability.e2e-spec.ts::rejects a range longer than two months`<br>Unit: `src/venues/availability.spec.ts::US-17 venue availability aggregation resolveRange` |

### TC-S2-14

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-14 |
| Story/AC ref | Story 17 AC-3 |
| Test Scenario | Booked days are shown without revealing the other booking's event or organiser |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-14-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Open March 2027 for Main Hall. |
| Test Data | Confirmed 10 Mar and pending 12 Mar, for event "Secret Board Offsite" by Olivia Organiser |
| Expected Result | Every day has only a date and a status. 10 Mar is booked, 11 Mar free. The event name, its id and the organiser appear nowhere in the response. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-availability.e2e-spec.ts::returns only date and status for every day`<br>Integration: `test/venues-availability.e2e-spec.ts::never mentions the event, its id, or its organiser`<br>Integration: `test/venues-availability.e2e-spec.ts::marks an approved day as booked`<br>Unit: `src/venues/availability.spec.ts::US-17 venue availability aggregation AC-3: a confirmed booking marks the day booked` |

### TC-S2-183

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-183 |
| Story/AC ref | Story 17 AC-3 |
| Test Scenario | A Coordinator sees that a period is blocked, but never why or who blocked it |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-182-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator). |
| Test Steps | 1. Read Main Hall's March 2027 calendar and 15 Mar's hours.<br>2. Search both responses for the block's reason, id and author. |
| Test Data | `BLK-001`, reason "Confidential renovation", set by USR-010 |
| Expected Result | Neither response contains the reason, the block's id or who set it. On screen, a blocked day's hours are listed with nothing about why. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | As expected. |
| Status | Pass |
| Remarks | AC-3 names the other booking's event and organiser; the same privacy is applied to Venue Staff's blocks. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-availability.e2e-spec.ts::never reveals why the period is blocked or who blocked it`<br>UI: `frontend/src/features/venues/components/venue-availability-calendar.test.tsx::Given a blocked day is selected, Then its blocked hours are listed, with nothing about why` |

### TC-S2-15

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-15 |
| Story/AC ref | Story 17 AC-4 |
| Test Scenario | A day with only a pending request is shown as tentatively available |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-15-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Open March 2027 for Main Hall. |
| Test Data | Pending request 12 Mar, rejected request 14 Mar, nothing confirmed |
| Expected Result | 12 Mar is tentative (distinct from free and booked). 14 Mar is free. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-availability.e2e-spec.ts::marks a day with only a pending request as tentative`<br>Integration: `test/venues-availability.e2e-spec.ts::treats a rejected request as free`<br>Unit: `src/venues/availability.spec.ts::US-17 venue availability aggregation AC-4: pending-only days are tentative` |

### TC-S2-16

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-16 |
| Story/AC ref | Story 17 Access |
| Test Scenario | Only Coordinators can view a venue's availability, and only for published venues |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql on testDB (reset before test). Logged in as Each base user in turn. |
| Test Steps | 1. Open Main Hall's availability as Venue Staff, Organiser, Technical Support and Attendee.<br>2. Open it without logging in.<br>3. Open the draft Annex, and an unknown venue id, as the Coordinator. |
| Test Data | — |
| Expected Result | Other roles are refused (403); no login is refused (401); the draft and unknown venues are not found (404). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-availability.e2e-spec.ts::refuses %s with 403`<br>Integration: `test/venues-availability.e2e-spec.ts::refuses an unauthenticated caller`<br>Integration: `test/venues-availability.e2e-spec.ts::reports a draft venue as not found`<br>Integration: `test/venues-availability.e2e-spec.ts::reports an unknown venue as not found` |

### TC-S2-17

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-17 |
| Story/AC ref | Story 17 AC-1, AC-3, AC-4 (UI) |
| Test Scenario | See booked, tentative and free days styled differently on a venue's calendar |
| Pre-conditions | Browser test: run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-14-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. UI tests: API mocked. |
| Test Steps | 1. Open Main Hall's details, then its availability calendar.<br>2. Go forward to March 2027.<br>3. Read 10, 12 and 16 March. |
| Test Data | tc-s2-14: a confirmed booking on 10 Mar 2027 and a pending request on 12 Mar, for "Secret Board Offsite" by Olivia Organiser |
| Expected Result | 10 March is shown as booked, 12 March as tentatively held, 16 March as free, each styled differently and named in the legend. Neither the event name nor the organiser appears. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | As expected: "Booked" (shaded and struck through), "Tentatively held" (amber), "Free" (plain). |
| Status | Pass |
| Remarks | Was manual; now automated by UI and browser tests. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | E2E: `e2e/us16-us19-venues.spec.ts::US-17: a Coordinator sees booked, tentative and free days apart, and nothing about the other event`<br>UI: `frontend/src/features/venues/components/venue-availability-calendar.test.tsx::labels and styles each status differently, and the legend names them`<br>UI: `frontend/src/features/venues/components/venue-availability-calendar.test.tsx::marks a tentative booking as tentatively held`<br>UI: `frontend/src/features/venues/components/venue-availability-calendar.test.tsx::free days are not selectable, and nothing is fetched until a day is chosen`<br>UI: `frontend/src/features/venues/components/venue-availability-calendar.test.tsx::lists a selected day’s setup, event and turnaround as separate times` |

**US-17 AC ↔ code notes**

- **AC-1 (resolved since 18 Oct):** blocked-off periods are now shown on the Coordinator's calendar (TC-S2-182), without the reason or who set them (TC-S2-183).

---

## Story 18: Search and filter venues by date, capacity, accessibility, facilities (Event Coordinator)

### TC-S2-18

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-18 |
| Story/AC ref | Story 18 Baseline |
| Test Scenario | An empty search returns every published venue and never a draft; results are not cached |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-18-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Search with no filters.<br>2. Search for capacity at least 100 with a stage. |
| Test Data | Alpha (500, stage), Bravo (100), Draft (draft, 500, stage) |
| Expected Result | No filters returns Alpha and Bravo. The filtered search returns Alpha only; the draft never appears. The response is not cached. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-search.e2e-spec.ts::US-18: an empty search returns every published venue`<br>Integration: `test/venues-search.e2e-spec.ts::US-18: never returns a draft venue, even one matching every filter`<br>Integration: `test/venues-search.e2e-spec.ts::US-18: is not cached`<br>Unit: `src/venues/venues-search.service.spec.ts::US-18 VenuesService.search` |

### TC-S2-19

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-19 |
| Story/AC ref | Story 18 AC-1 |
| Test Scenario | A date/time search excludes venues with a confirmed booking overlapping the slot, however it overlaps |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-19-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Search for 10 Mar 2027 09:00-17:00 SGT.<br>2. Search for the same hours on 11 Mar.<br>3. Search with only a start, and with the range backwards. |
| Test Data | Venues Approved, Pending, Rejected, Adjacent (back-to-back), Untouched, and four "Partial" venues whose confirmed booking only partly overlaps |
| Expected Result | The slot returns Adjacent, Pending, Rejected and Untouched only: Approved and all four Partial venues are excluded. On 11 Mar, Approved is offered again. The half and backwards ranges are refused (400). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-search.e2e-spec.ts::excludes a venue with an APPROVED booking overlapping the slot`<br>Integration: `test/venues-search.e2e-spec.ts::includes a venue with only a pending (REQUESTED) booking — AC-1 says "confirmed"`<br>Integration: `test/venues-search.e2e-spec.ts::includes venues with a rejected or back-to-back booking`<br>Integration: `test/venues-search.e2e-spec.ts::includes the approved venue again for a slot that does not overlap`<br>Integration: `test/venues-search.e2e-spec.ts::excludes a venue whose confirmed booking %s`<br>Integration: `test/venues-search.e2e-spec.ts::rejects half a range`<br>Integration: `test/venues-search.e2e-spec.ts::rejects a range that ends before it starts`<br>Unit: `src/venues/venues-search.service.spec.ts::US-18 VenuesService.search`<br>Unit: `src/venues/venues-search.service.spec.ts::US-18 VenuesService.search VenueSearchDto` |

### TC-S2-20

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-20 |
| Story/AC ref | Story 18 AC-2 |
| Test Scenario | Minimum capacity includes venues at the minimum and excludes those below it |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-20-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Search with minimum capacity 100, then 101.<br>2. Search with minimum capacity "lots". |
| Test Data | Hundred (100), NinetyNine (99) |
| Expected Result | Minimum 100 returns Hundred only; 101 returns nothing; "lots" is refused (400). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-search.e2e-spec.ts::includes a venue whose capacity equals the minimum`<br>Integration: `test/venues-search.e2e-spec.ts::excludes a venue one below the minimum`<br>Integration: `test/venues-search.e2e-spec.ts::rejects a non-numeric minimum`<br>Unit: `src/venues/venues-search.service.spec.ts::US-18 VenuesService.search` |

### TC-S2-21

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-21 |
| Story/AC ref | Story 18 AC-3 |
| Test Scenario | Selecting accessibility requirements returns only venues meeting all of them |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-21-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Search for step-free access.<br>2. Search for step-free access and hearing loop (as a list, and as a repeated parameter).<br>3. Search for "Step-free access" (free text). |
| Test Data | Both (step-free, hearing loop), StepOnly (step-free) |
| Expected Result | Step-free returns both venues; both requirements return Both only, either way. A value outside the shared vocabulary is refused (400). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-search.e2e-spec.ts::matches a venue offering the one selected feature`<br>Integration: `test/venues-search.e2e-spec.ts::excludes a venue missing one of several selected features`<br>Integration: `test/venues-search.e2e-spec.ts::accepts the list as a repeated key`<br>Integration: `test/venues-search.e2e-spec.ts::rejects a value outside the shared vocabulary`<br>Unit: `src/venues/venues-search.service.spec.ts::US-18 VenuesService.search` |

### TC-S2-22

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-22 |
| Story/AC ref | Story 18 AC-4 |
| Test Scenario | Selecting facilities returns only venues offering all of them |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-22-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Search for projector and Wi-Fi.<br>2. Search for stage.<br>3. Search for "Projector" (free text). |
| Test Data | Full (projector, Wi-Fi, stage), NoWifi (projector, stage) |
| Expected Result | Projector + Wi-Fi returns Full only; stage returns both; the free-text value is refused (400). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-search.e2e-spec.ts::excludes a venue missing one selected facility`<br>Integration: `test/venues-search.e2e-spec.ts::includes every venue offering the selected facility`<br>Integration: `test/venues-search.e2e-spec.ts::rejects a value outside the Facility vocabulary`<br>Unit: `src/venues/venues-search.service.spec.ts::US-18 VenuesService.search` |

### TC-S2-23

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-23 |
| Story/AC ref | Story 18 AC-5 |
| Test Scenario | All filters combine with AND |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-23-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Search for 10 Mar 2027 09:00-17:00 SGT, capacity at least 100, projector, step-free access. |
| Test Data | Match, and four venues each failing exactly one filter (TooSmall, NoProjector, NotAccessible, Booked) |
| Expected Result | Only Match is returned. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-search.e2e-spec.ts::returns only the venue satisfying every dimension at once`<br>Unit: `src/venues/venues-search.service.spec.ts::US-18 VenuesService.search`<br>UI: `frontend/src/pages/coordinator-venues.test.tsx::sends minimum capacity, accessibility and facilities in one search when Apply is pressed` |

### TC-S2-24

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-24 |
| Story/AC ref | Story 18 AC-5 |
| Test Scenario | A name lookup also combines with the other filters by AND |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-24-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Search for name "audit" with capacity at least 500. |
| Test Data | Sandbox Auditorium (400), Seminar Room (40), Draft Auditorium (draft) |
| Expected Result | Nothing is returned (the only matching name is too small). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The plain name lookup in the same file proves Story 15 AC-3, which belongs to Sprint 1. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-search.e2e-spec.ts::combines a name lookup with the other filters by AND`<br>Unit: `src/venues/venues-search.service.spec.ts::US-18 VenuesService.search` |

### TC-S2-25

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-25 |
| Story/AC ref | Story 18 AC-6 |
| Test Scenario | A search with no matches returns a clean empty result |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Search for capacity at least 5000. |
| Test Data | base-venues (largest capacity 300) |
| Expected Result | A successful response with an empty list, which the UI shows as "no results". |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The screen's "no results" state is TC-S2-185. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-search.e2e-spec.ts::returns 200 with an empty array`<br>UI: `frontend/src/pages/coordinator-venues.test.tsx::says no venues match, and offers to clear the filters` |

### TC-S2-26

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-26 |
| Story/AC ref | Story 18 AC-7 |
| Test Scenario | A filtered search over a realistic catalogue returns within 2 seconds |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-26-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Search 10 Mar 2027 09:00-17:00 SGT, capacity at least 100, projector, step-free access. |
| Test Data | 300 venues (every 10th a draft) and 600 bookings |
| Expected Result | The results are returned in under 2 seconds. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-search.e2e-spec.ts::searches 300 venues with 600 bookings in one round trip under 2s` |

### TC-S2-27

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-27 |
| Story/AC ref | Story 18 Access |
| Test Scenario | Only Coordinators can search venues |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as Venue Staff, Organiser, Attendee. |
| Test Steps | 1. Search as each of those roles.<br>2. Search without logging in. |
| Test Data | — |
| Expected Result | Other roles are refused (403); no login is refused (401). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-search.e2e-spec.ts::refuses %s with 403`<br>Integration: `test/venues-search.e2e-spec.ts::refuses an unauthenticated caller` |

### TC-S2-185

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-185 |
| Story/AC ref | Story 18 AC-2, AC-6 (UI) |
| Test Scenario | On the venue search page, a Coordinator filters by minimum capacity and sees a clear message when nothing matches |
| Pre-conditions | Browser test: run test/fixtures/sql/base-users.sql + base-venues.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Open Venues.<br>2. Set Minimum capacity to 100 and click Apply filters.<br>3. Set it to 5000 and apply again. |
| Test Data | Main Hall 300, Rooftop Terrace 120, Seminar Room 40 |
| Expected Result | Step 2 leaves Main Hall and Rooftop Terrace and drops Seminar Room. Step 3 shows "No venues match your filters", not an empty or broken list. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | As expected. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | E2E: `e2e/us16-us19-venues.spec.ts::US-18: a Coordinator filters venues by capacity, and sees a clear message when nothing matches`<br>UI: `frontend/src/pages/coordinator-venues.test.tsx::says no venues match, and offers to clear the filters` |

**US-18 AC ↔ code notes**

- **Name lookup:** the search also takes a venue name (US-15 AC-3, kept when US-18 replaced the catalogue page for Coordinators), combined with the other filters by AND (TC-S2-24).

---

## Story 19: System flags whether a venue appears suitable before submitting (Event Coordinator)

### TC-S2-28

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-28 |
| Story/AC ref | Story 19 AC-1, AC-2, AC-4 |
| Test Scenario | A venue meeting every check is shown as suitable, with each check listed |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-28-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Check Hall's suitability for event "Fits". |
| Test Data | Hall: capacity 100, step-free, theatre. Event: 80 expected, needs step-free, prefers theatre |
| Expected Result | Overall SUITABLE, with capacity, accessibility and layout each shown as met. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-suitability.e2e-spec.ts::US-19: reports a suitable venue as positively SUITABLE, with each check shown`<br>Unit: `src/venues/suitability.spec.ts::US-19 venue suitability AC-1: capacity`<br>Unit: `src/venues/suitability.spec.ts::US-19 venue suitability layout (beyond the listed ACs)`<br>Unit: `src/venues/suitability.spec.ts::US-19 venue suitability AC-4: overall indicator`<br>UI: `frontend/src/features/venues/components/venue-suitability-panel.test.tsx::shows a clear "Appears suitable" when every check is met` |

### TC-S2-29

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-29 |
| Story/AC ref | Story 19 AC-1, AC-2 |
| Test Scenario | Over capacity, and each missing accessibility requirement, are flagged individually |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-28-setup.sql + tc-s2-29-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Check Hall's suitability for an event of 101 needing step-free access and a hearing loop. |
| Test Data | Hall holds 100 |
| Expected Result | Overall NOT_SUITABLE. Capacity unmet. Accessibility lists step-free as met and hearing loop as not met, separately. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-suitability.e2e-spec.ts::US-19: flags capacity and each missing accessibility requirement individually`<br>Unit: `src/venues/suitability.spec.ts::US-19 venue suitability AC-1: capacity`<br>Unit: `src/venues/suitability.spec.ts::US-19 venue suitability AC-2: accessibility, one flag per requirement`<br>UI: `frontend/src/features/venues/components/venue-suitability-panel.test.tsx::flags over-capacity and names each missing accessibility requirement` |

### TC-S2-30

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-30 |
| Story/AC ref | Story 19 AC-3 |
| Test Scenario | The venue's facilities are checked against each facility the event requires |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-28-setup.sql + tc-s2-30-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator). |
| Test Steps | 1. Check Equipped hall against "Needs projector and mics".<br>2. Check it against "Needs a stage".<br>3. Check Hall against "Fits", which requires no facility. |
| Test Data | `VEN-036` Equipped hall (Projector, Microphones); `EVT-180` needs Projector + Microphones; `EVT-181` needs Projector + Stage; `EVT-076` needs none |
| Expected Result | 1: Facilities met, each one listed, venue suitable. 2: Facilities not met, Stage named as missing, venue may not be suitable. 3: Nothing required, and nothing reported as unchecked. The panel shows the same. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | As expected. |
| Status | Pass |
| Remarks | Was Fail (code gap) on 18 Oct. Sprint 4 added the event's required facilities and the check, so AC-3 is now met for facilities; equipment is TC-S2-184. The test cited on 18 Oct no longer exists. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-suitability.e2e-spec.ts::US-19: Given the venue has every required facility, Then facilities are met`<br>Integration: `test/venues-suitability.e2e-spec.ts::US-19: Given a required facility the venue lacks, Then it is flagged and the venue may not be suitable`<br>Integration: `test/venues-suitability.e2e-spec.ts::US-19: Given no required facilities, Then nothing is required and nothing is reported unchecked`<br>Unit: `src/venues/suitability.spec.ts::US-19 venue suitability AC-3: facilities cover the technical requirements`<br>UI: `frontend/src/features/venues/components/venue-suitability-panel.test.tsx::Given every required facility is met, Then the Facilities row lists them`<br>UI: `frontend/src/features/venues/components/venue-suitability-panel.test.tsx::Given a missing facility, Then the Facilities row names it`<br>UI: `frontend/src/features/venues/components/venue-suitability-panel.test.tsx::Given no facilities are required, Then it says none required` |

### TC-S2-184

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-184 |
| Story/AC ref | Story 19 AC-3 |
| Test Scenario | The event's equipment is checked against what is free over the event's dates |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-28-setup.sql + tc-s2-30-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator). |
| Test Steps | Check Hall against each of EVT-182, 183, 185, 186, 187 and 188 in turn. |
| Test Data | Each event needs one catalogue item of 6: `EVT-182` 4 (nothing else holds it); `EVT-183` 4 (another event holds 3, approved); `EVT-185` 4 (its own approved reservation of 4); `EVT-186` 4 (another event's request for 6, pending only); `EVT-187` 1 (item under maintenance); `EVT-188` a free-text "Fog machine" |
| Expected Result | 182: met, 6 free. 183: not met, 3 free; the venue verdict is unchanged, since equipment is the same at every venue. 185: met, its own reservation isn't counted against it. 186: met, a pending request holds nothing. 187: none available. 188: not checked, with a reason, never shown as met. Checking reserves nothing. The panel shows each of these. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | As expected. |
| Status | Pass |
| Remarks | These tests had no test case before the regeneration, and inserted their rows in the test; they now load tc-s2-30-setup.sql. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-suitability.e2e-spec.ts::US-19: Given enough free units, Then equipment is met, with the free count`<br>Integration: `test/venues-suitability.e2e-spec.ts::US-19: Given another event's approved reservation leaves too few units, Then equipment is unmet`<br>Integration: `test/venues-suitability.e2e-spec.ts::US-19: Given the event's own approved reservation, Then its units are not counted against it`<br>Integration: `test/venues-suitability.e2e-spec.ts::US-19: Given a pending reservation elsewhere, Then it holds no units`<br>Integration: `test/venues-suitability.e2e-spec.ts::US-19: Given an item under maintenance, Then none of its units are available`<br>Integration: `test/venues-suitability.e2e-spec.ts::US-19: Given a free-text line, Then it is listed as not checked, never as a pass`<br>Integration: `test/venues-suitability.e2e-spec.ts::US-19: reserves nothing while checking`<br>Unit: `src/venues/suitability.spec.ts::US-19 venue suitability AC-3: the equipment asked for is available`<br>UI: `frontend/src/features/venues/components/venue-suitability-panel.test.tsx::Given an equipment item is short, Then the Equipment row says how many are free`<br>UI: `frontend/src/features/venues/components/venue-suitability-panel.test.tsx::Given all equipment is available, Then the Equipment row lists it`<br>UI: `frontend/src/features/venues/components/venue-suitability-panel.test.tsx::Given a free-text equipment line, Then the panel says it was not checked, with the reason`<br>UI: `frontend/src/features/venues/components/venue-suitability-panel.test.tsx::Then the panel explains equipment does not change the venue verdict` |

### TC-S2-31

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-31 |
| Story/AC ref | Story 19 AC-5 |
| Test Scenario | Suitability flags are advisory: the check changes nothing, and the request can still be submitted |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-28-setup.sql + tc-s2-31-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Check Hall's suitability for an event of 80 needing a hearing loop.<br>2. Submit the booking request anyway (`POST /bookings`). |
| Test Data | Hall holds 100, no hearing loop |
| Expected Result | The check returns NOT_SUITABLE and creates or changes nothing. The booking request is still accepted (201) as pending. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Updated 2026-10-23: the event's attendance was lowered from 500 to 80. Capacity is now a hard block (an over-capacity request is refused with CAPACITY_EXCEEDED), so the advisory flag is the missing hearing loop. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-suitability.e2e-spec.ts::US-19: changes nothing — no booking, reservation, notification or event edit`<br>Integration: `test/venues-suitability.e2e-spec.ts::US-19 AC-5: a booking request still submits after suitability reports flags`<br>E2E: `e2e/us16-us19-venues.spec.ts::US-19: a misfit is flagged, and the Coordinator can still request the venue` |

### TC-S2-186

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-186 |
| Story/AC ref | Story 19 AC-2, AC-5 (UI) |
| Test Scenario | On screen, a venue that doesn't suit the event is flagged, and the Coordinator can still go on and request it |
| Pre-conditions | Browser test: run test/fixtures/sql/base-users.sql + tc-s2-28-setup.sql + tc-s2-31-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Open Hall's Suitability tab and check it against "Misfit".<br>2. Click "Request this venue".<br>3. Submit the booking request. |
| Test Data | `VEN-035` Hall (no hearing loop); `EVT-091` "Misfit" needs a hearing loop, 80 expected |
| Expected Result | The panel says "May not be suitable" and names the missing hearing loop. "Request this venue" opens Misfit's booking form with Hall already chosen, and the request is submitted as pending. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | As expected. |
| Status | Pass |
| Remarks | **Code changed in this regeneration:** "Request this venue" was a disabled button saying the booking flow wasn't available yet, although it was (on the event's page). It now opens that event's booking form with the venue chosen, or the Suitability tab if no event is chosen yet. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | E2E: `e2e/us16-us19-venues.spec.ts::US-19: a misfit is flagged, and the Coordinator can still request the venue` |

### TC-S2-32

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-32 |
| Story/AC ref | Story 19 AC-6 |
| Test Scenario | The suitability check returns within 2 seconds |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-28-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Check Hall's suitability for event "Fits". |
| Test Data | — |
| Expected Result | The result is returned in under 2 seconds. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-suitability.e2e-spec.ts::US-19: answers within two seconds` |

### TC-S2-33

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-33 |
| Story/AC ref | Story 19 Access |
| Test Scenario | The check is only for my assigned, active events and published venues |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-28-setup.sql + tc-s2-33-setup.sql on testDB (reset before test). Logged in as coord.a@example.com; venue.staff@example.com; organiser@example.com. |
| Test Steps | 1. Check another Coordinator's event, an unassigned one, and rejected/cancelled/completed ones.<br>2. Check the draft venue, and check without an event.<br>3. Check as Venue Staff and as the Organiser. |
| Test Data | tc-s2-33 events |
| Expected Result | Those events and the draft venue are not found (404); no event is refused (400); other roles are refused (403). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-suitability.e2e-spec.ts::US-19: hides another Coordinator's event as not found`<br>Integration: `test/venues-suitability.e2e-spec.ts::US-19: hides an unassigned event from the review pool`<br>Integration: `test/venues-suitability.e2e-spec.ts::US-19: hides a %s event as not found`<br>Integration: `test/venues-suitability.e2e-spec.ts::US-19: reports a draft venue as not found`<br>Integration: `test/venues-suitability.e2e-spec.ts::US-19: requires an eventId`<br>Integration: `test/venues-suitability.e2e-spec.ts::US-19: refuses %s with 403` |

**US-19 AC ↔ code notes**

- **AC-3 (resolved since 18 Oct):** the check now covers the event's required facilities (TC-S2-30) and its catalogue equipment over the event's dates (TC-S2-184).
- **AC-5 vs the capacity rule:** a later customer change made over-capacity a hard block on the booking request (CAPACITY_EXCEEDED), so capacity is no longer only advisory. Every other flag still is (TC-S2-31).
- **AC-5 (fixed in this regeneration):** "Request this venue" on the venue's page was disabled; it now opens the event's booking form with the venue chosen (TC-S2-186).

---

## Story 20: Submit a request to book a venue with timing and requirements (Event Coordinator)

### TC-S2-34

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-34 |
| Story/AC ref | Story 20 AC-1 |
| Test Scenario | The booking request requires a valid date, start/end time and attendance |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-34-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Submit with no times or attendance.<br>2. Submit with a past start, an end before the start, zero attendance, and 12.5 attendance. |
| Test Data | Event "Orientation", Main Hall |
| Expected Result | Each is refused (400), naming every offending field; nothing is saved. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-request.e2e-spec.ts::rejects a request missing them, flagging each field`<br>Integration: `test/bookings-request.e2e-spec.ts::refuses %s (400) and creates nothing`<br>Unit: `src/bookings/bookings-request.service.spec.ts::BookingsService createRequest (US-20) AC-1: date, start/end time and expected attendance are required`<br>UI: `frontend/src/features/bookings/components/booking-request-form.test.tsx::keeps Submit disabled until the venue, date, times and attendance are all filled in` |

### TC-S2-35

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-35 |
| Story/AC ref | Story 20 AC-2, AC-3 |
| Test Scenario | The event's requirements are attached and the request is pending |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-34-setup.sql (+ tc-s2-35-setup.sql for steps 2-4) on testDB (reset before test). Logged in as coord.a@example.com, then venue.staff@example.com. |
| Test Steps | 1. Request Main Hall for Orientation (`POST /bookings`).<br>2. Request it for "Orientation (technical)", which has equipment lines, technical support and required facilities, then open the request as Venue Staff.<br>3. Clear that event's requirements and open the request again.<br>4. Open BKG-001, a request made before requests carried them. |
| Test Data | Orientation: theatre, hearing loop ("Two hearing aid users"), "2 wireless mics" |
| Expected Result | The request is pending and carries the layout, accessibility needs and notes, and equipment notes. It also carries every equipment line, the technical support needed and the required facilities, which Venue Staff see on the request without opening the event, and which stay as submitted when the event changes. With none recorded the list is empty; on an older request it reads as not recorded. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The code gap noted on 18 Oct (the structured equipment list and technical support were not attached) is closed: they are copied onto the request when it is made. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-request.e2e-spec.ts::creates a REQUESTED booking carrying the event requirements`<br>Integration: `test/bookings-request.e2e-spec.ts::Given equipment lines, technical support and facilities, When submitted, Then all are attached`<br>Integration: `test/bookings-request.e2e-spec.ts::Given the venue manager opens the request, Then they see them without opening the event`<br>Integration: `test/bookings-request.e2e-spec.ts::Given the event changes after submission, Then the request keeps what was submitted`<br>Integration: `test/bookings-request.e2e-spec.ts::Given none recorded, Then the request carries an empty list, not "not recorded"`<br>Integration: `test/bookings-request.e2e-spec.ts::Given a request made before these were attached, Then its list reads as not recorded (null)`<br>Unit: `src/bookings/bookings-request.service.spec.ts::BookingsService createRequest (US-20) AC-2: event requirements are attached to the request`<br>Unit: `src/bookings/bookings-request.service.spec.ts::BookingsService createRequest (US-20) AC-3: a new request is pending, not confirmed`<br>UI: `frontend/src/features/bookings/components/booking-details.test.tsx::Given the request carries equipment lines, Then each is listed with its quantity and notes`<br>UI: `frontend/src/features/bookings/components/booking-details.test.tsx::Then the technical support, required facilities and free-text notes are shown`<br>UI: `frontend/src/features/bookings/components/booking-details.test.tsx::Given none were recorded, Then each says so`<br>UI: `frontend/src/features/bookings/components/booking-details.test.tsx::Given a request made before these were attached, Then it says they were not recorded on it` |

### TC-S2-36

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-36 |
| Story/AC ref | Story 20 AC-4 |
| Test Scenario | A request overlapping a confirmed booking is blocked, naming the conflict |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-34-setup.sql + tc-s2-36-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Request Main Hall 09:00-12:00 on 1 Oct 2030. |
| Test Data | Confirmed "Hackathon" 10:00-14:00 the same day |
| Expected Result | Refused (409), naming the "Hackathon" booking; nothing is saved. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-request.e2e-spec.ts::returns 409 naming the conflicting booking, and creates nothing`<br>Unit: `src/bookings/bookings-request.service.spec.ts::BookingsService createRequest (US-20) AC-4: overlap with a confirmed booking blocks submission`<br>UI: `frontend/src/features/bookings/components/booking-request-form.test.tsx::shows which confirmed booking blocks the request` |

### TC-S2-37

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-37 |
| Story/AC ref | Story 20 AC-4 |
| Test Scenario | A back-to-back slot is not a conflict |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-34-setup.sql + tc-s2-37-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Request Main Hall 09:00-12:00 on 1 Oct 2030. |
| Test Data | Confirmed "Hackathon" 12:00-14:00 the same day |
| Expected Result | Accepted (201). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-request.e2e-spec.ts::allows a back-to-back slot that only touches the confirmed one`<br>Unit: `src/bookings/bookings-request.service.spec.ts::BookingsService createRequest (US-20) AC-4: overlap with a confirmed booking blocks submission` |

### TC-S2-38

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-38 |
| Story/AC ref | Story 20 AC-5 |
| Test Scenario | A request overlapping only a pending request is allowed, with a warning naming it |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-34-setup.sql + tc-s2-38-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Request Main Hall 09:00-12:00 on 1 Oct 2030. |
| Test Data | Pending "Hackathon" 10:00-14:00 the same day |
| Expected Result | Accepted (201) with a warning naming "Hackathon" and its 10:00-14:00 times. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-request.e2e-spec.ts::creates the request and warns about the pending one`<br>Integration: `test/bookings-request.e2e-spec.ts::names the conflicting request by event and time range`<br>Unit: `src/bookings/bookings-request.service.spec.ts::BookingsService createRequest (US-20) AC-5: overlap with only a pending request is allowed with a warning`<br>UI: `frontend/src/features/bookings/components/booking-request-form.test.tsx::confirms the request, warns about the overlapping pending one, and links to my requests` |

### TC-S2-39

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-39 |
| Story/AC ref | Story 20 AC-6 |
| Test Scenario | The submitted request appears in the Coordinator's own history |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-34-setup.sql on testDB (reset before test). Logged in as coord.a@example.com; coord.b@example.com. |
| Test Steps | 1. Submit the request.<br>2. Open "My venue requests" as each Coordinator. |
| Test Data | — |
| Expected Result | It is listed for Cody, who submitted it, and not for Casey. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The confirmation on screen, and the link to the Coordinator's requests, are covered by the UI test and TC-S2-187. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-request.e2e-spec.ts::lists it under GET /bookings/mine for the requester only`<br>UI: `frontend/src/features/bookings/components/booking-request-form.test.tsx::confirms the request, warns about the overlapping pending one, and links to my requests` |

### TC-S2-40

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-40 |
| Story/AC ref | Story 20 Access |
| Test Scenario | Only the event's Coordinator can request, only once approved; details are visible only to those involved |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-34-setup.sql + tc-s2-40-setup.sql + tc-s2-01-setup.sql on testDB (reset before test). Logged in as Several. |
| Test Steps | 1. Submit as the Organiser, and as another Coordinator.<br>2. Submit for an event that is only SUBMITTED.<br>3. Open the request as each user. |
| Test Data | tc-s2-40: "Not approved yet" |
| Expected Result | Organiser refused (403); other Coordinator not found (404); unapproved event refused (409). The requester, the Organiser and the venue's manager can open it; Victor Venue and Casey cannot (404). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-request.e2e-spec.ts::denies an Organiser (403)`<br>Integration: `test/bookings-request.e2e-spec.ts::hides an event assigned to another Coordinator (404)`<br>Integration: `test/bookings-request.e2e-spec.ts::refuses an event that has not been approved yet (409)`<br>Integration: `test/bookings-request.e2e-spec.ts::shows full detail to the requester, the event's Organiser and the venue's manager only`<br>Unit: `src/bookings/bookings-request.service.spec.ts::BookingsService createRequest (US-20) authorisation and preconditions`<br>Unit: `src/bookings/bookings-request.service.spec.ts::BookingsService createRequest (US-20) viewing one request in full` |

**US-20 AC ↔ code notes**

- **AC-2 (resolved since 18 Oct):** the event's equipment lines, technical support and required facilities are now attached to the request (TC-S2-35).
- **Capacity (Sprint 3 change):** a request for more people than the venue holds is refused (CAPACITY_EXCEEDED). Not a Story 20 AC; its tests in `bookings-request.e2e-spec.ts` are labelled as the Sprint 3 change.

---

## Story 21: Venue Booking Request Queue (Venue Staff)

### TC-S2-41

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-41 |
| Story/AC ref | Story 21 AC-1 |
| Test Scenario | The queue lists only pending requests for venues I manage |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-01-setup.sql + tc-s2-41-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com; coord.a@example.com. |
| Test Steps | 1. Open the booking request queue.<br>2. Open it as a Coordinator. |
| Test Data | Pending and approved requests on Main Hall; a pending one on Other Hall |
| Expected Result | Only "Mine pending" is listed. The Coordinator is refused (403). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-queue.e2e-spec.ts::excludes other staff's venues and decided requests`<br>Integration: `test/bookings-queue.e2e-spec.ts::is denied to a Coordinator (403)`<br>Unit: `src/bookings/bookings-queue.service.spec.ts::BookingsService findQueue (US-21) AC-1: pending requests for venues I manage` |

### TC-S2-42

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-42 |
| Story/AC ref | Story 21 AC-2 |
| Test Scenario | Each queue entry shows the event, venue, date/time, attendance, requester and organiser |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-42-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Open the queue. |
| Test Data | Pending "Showcase", Main Hall, 21 Sep 2030 09:00-12:00 UTC, 80 expected |
| Expected Result | The entry shows Showcase, Main Hall, 09:00-12:00 on 21 Sep, 80 expected, requested by Cody Coordinator for Olivia Organiser. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-queue.e2e-spec.ts::carries event, venue, times, attendance, requester and organiser`<br>Unit: `src/bookings/bookings-queue.service.spec.ts::BookingsService findQueue (US-21) AC-2: each entry carries what is needed to review it`<br>UI: `frontend/src/features/bookings/components/queue-row.test.tsx::US-21: the meta line is short, and times drop "local"` |

### TC-S2-43

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-43 |
| Story/AC ref | Story 21 AC-3 |
| Test Scenario | The queue sorts by event date or by submission date |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-43-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Open the queue with the default sort, event date descending, and submitted descending.<br>2. Sort by an unknown field. |
| Test Data | "Sooner" (event 16 Sep, submitted later) and "Later" (event 1 Oct, submitted earlier) |
| Expected Result | Default: Sooner, Later. Event date descending: Later, Sooner. Submitted descending: Sooner, Later. Unknown field refused (400). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-queue.e2e-spec.ts::sorts by event date, soonest first, by default`<br>Integration: `test/bookings-queue.e2e-spec.ts::sorts by event date, latest first, when asked`<br>Integration: `test/bookings-queue.e2e-spec.ts::sorts by submission date when asked`<br>Integration: `test/bookings-queue.e2e-spec.ts::rejects an unknown sort field (400)`<br>Unit: `src/bookings/bookings-queue.service.spec.ts::BookingsService findQueue (US-21) AC-3: sorting`<br>UI: `frontend/src/pages/venue-booking-queue.test.tsx::sorts by submission date when chosen` |

### TC-S2-44

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-44 |
| Story/AC ref | Story 21 AC-4 |
| Test Scenario | The queue filters by venue, date range and status |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-44-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Filter by Seminar Room.<br>2. Filter 6-16 Sep 2030.<br>3. Open the decided view filtered to rejected. |
| Test Data | tc-s2-44 requests across three venues and statuses |
| Expected Result | Seminar Room: "In room". 6-16 Sep: "Inside". Decided + rejected: "Rejected one". |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-queue.e2e-spec.ts::filters by venue`<br>Integration: `test/bookings-queue.e2e-spec.ts::filters by date range`<br>Integration: `test/bookings-queue.e2e-spec.ts::filters the decided view by status`<br>Unit: `src/bookings/bookings-queue.service.spec.ts::BookingsService findQueue (US-21) AC-4: filtering`<br>UI: `frontend/src/pages/venue-booking-queue.test.tsx::filters by one of my venues, and never offers another manager’s` |

### TC-S2-45

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-45 |
| Story/AC ref | Story 21 AC-5 |
| Test Scenario | Requests under a week away, or already started, are flagged and moved to the top |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-45-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Open the queue sorted by submission date, oldest first.<br>2. Open the default queue. |
| Test Data | "Now" frozen at 1 Sep 2030. Far (+30 days), Near (+3 days), Overdue (started yesterday) |
| Expected Result | Overdue and Near are flagged and listed before Far, despite the sort. Overdue has a negative day count. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Threshold: 7 days, per the team's comment on the story. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-queue.e2e-spec.ts::puts requests under a week away at the top, flagged`<br>Integration: `test/bookings-queue.e2e-spec.ts::still flags a request whose event has started, with a negative day count`<br>Unit: `src/bookings/bookings-queue.service.spec.ts::BookingsService findQueue (US-21) AC-5: requests nearing their event date are flagged and prioritised`<br>UI: `frontend/src/pages/venue-booking-queue.test.tsx::groups requests due this week above the later ones`<br>UI: `frontend/src/features/bookings/components/queue-row.test.tsx::US-21 AC-5: an event at %s is %s ("%s")`<br>UI: `frontend/src/features/bookings/components/queue-row.test.tsx::US-21 AC-5: more than a week away gets no indicator at all`<br>UI: `frontend/src/features/bookings/components/queue-row.test.tsx::US-21 AC-5: 9am tomorrow is "tomorrow" even at 11pm, though under 24 hours away`<br>UI: `frontend/src/features/bookings/components/queue-row.test.tsx::US-21 AC-5: red and amber rows get a thin left bar and a badge; upcoming is muted text with no bar` |

### TC-S2-46

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-46 |
| Story/AC ref | Story 21 AC-6 |
| Test Scenario | Opening a queue entry shows the full request with its special requirements |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-42-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Open the queue, then the "Showcase" entry. |
| Test Data | Showcase: theatre, hearing loop, "2 wireless mics" |
| Expected Result | The detail shows theatre, hearing loop with its notes, and the equipment. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-queue.e2e-spec.ts::GET /bookings/:id returns it with its requirements`<br>UI: `frontend/src/features/bookings/components/queue-row.test.tsx::US-21: the whole row is one link to the details page, with no "View details" button`<br>UI: `frontend/src/features/bookings/components/queue-row.test.tsx::US-21: the row opens from the keyboard` |

### TC-S2-47

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-47 |
| Story/AC ref | Story 21 AC-7 |
| Test Scenario | Approved or rejected requests leave the pending queue for the decided view |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-47-setup.sql + tc-s2-44-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Approve "Will approve" and reject "Will reject".<br>2. Open the pending and decided views. |
| Test Data | tc-s2-47 (two pending); tc-s2-44 (decided rows) |
| Expected Result | Pending is empty afterwards; both appear under Decided. With tc-s2-44, Pending holds only the four pending requests. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-queue.e2e-spec.ts::moves a request out of Pending as soon as it is approved or rejected`<br>Integration: `test/bookings-queue.e2e-spec.ts::shows approved and rejected requests only under view=decided`<br>Unit: `src/bookings/bookings-queue.service.spec.ts::BookingsService findQueue (US-21) AC-7: decided requests leave the pending view`<br>UI: `frontend/src/pages/venue-booking-queue.test.tsx::switches to the Decided view, with a status filter` |

**US-21 AC ↔ code notes**

- **Relabelled in this regeneration:** the queue's UI tests used the app-code label (US-22); they now use Story 21.

---

## Story 22: Approve/Reject Booking Request with Reason (Venue Staff)

### TC-S2-48

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-48 |
| Story/AC ref | Story 22 Access |
| Test Scenario | Only the Venue Staff member managing the venue can approve or reject its requests |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-48-setup.sql + tc-s2-01-setup.sql on testDB (reset before test). Logged in as venue.staff.b@example.com (Victor Venue); coord.a@example.com. |
| Test Steps | 1. As Victor Venue, approve the pending "Showcase" request on Main Hall.<br>2. As the Coordinator, approve it. |
| Test Data | Pending "Showcase", Main Hall (managed by Vera Venue), 1 Oct 2030 09:00-12:00 UTC |
| Expected Result | Victor Venue gets not found (404); the Coordinator is refused (403). The request stays pending. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | AC-1 itself (approve and reject are on the request detail view) is about the screen: TC-S2-81 (manual). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-decision.e2e-spec.ts::is refused for another staff member's venue (404) and for a Coordinator (403)`<br>Unit: `src/bookings/bookings-decision.service.spec.ts::BookingsService decisions (US-22) AC-1: actions act on a request the staff member can open` |

### TC-S2-49

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-49 |
| Story/AC ref | Story 22 AC-2 |
| Test Scenario | Rejecting a request requires a reason |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-48-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Reject "Showcase" with an empty reason.<br>2. Reject it with a reason of three spaces.<br>3. Reject it with "Under maintenance". |
| Test Data | Pending "Showcase" |
| Expected Result | The empty and blank reasons are refused (400) and the request stays pending. With a reason it is REJECTED and the reason is saved. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The bug noted on 18 Oct (a reason of only spaces was accepted) is fixed: RejectBookingDto and ReverseBookingDto now trim with @Trim() before checking. The `it.failing` test that captured it was replaced by regular regression tests. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-decision.e2e-spec.ts::refuses a rejection without a reason, and changes nothing`<br>Integration: `test/bookings-decision.e2e-spec.ts::rejects with a reason`<br>Integration: `test/bookings-decision.e2e-spec.ts::US-22 AC-2: whitespace-only reject reason refused`<br>Integration: `test/bookings-decision.e2e-spec.ts::US-22 AC-2: a normal reason is still saved, trimmed`<br>Unit: `src/bookings/bookings-decision.service.spec.ts::BookingsService decisions (US-22) AC-2: rejecting requires a reason`<br>UI: `frontend/src/features/bookings/components/booking-decision-reasons.test.tsx::US-22 AC-2: whitespace-only reject reason refused`<br>UI: `frontend/src/features/bookings/components/booking-decision-reasons.test.tsx::US-22 AC-2: a normal reject reason is sent, trimmed` |

### TC-S2-50

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-50 |
| Story/AC ref | Story 22 AC-3 |
| Test Scenario | Approving a request takes an optional note |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-48-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Approve "Showcase" with no note.<br>2. (Reset) Approve it with the note "Doors open 8am". |
| Test Data | Pending "Showcase" |
| Expected Result | Both approvals succeed (APPROVED). The note, when given, is saved with the decision. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-decision.e2e-spec.ts::approves with no body at all`<br>Integration: `test/bookings-decision.e2e-spec.ts::approves with a note`<br>Unit: `src/bookings/bookings-decision.service.spec.ts::BookingsService decisions (US-22) AC-3: approving allows an optional note` |

### TC-S2-51

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-51 |
| Story/AC ref | Story 22 AC-4 |
| Test Scenario | Every decision is timestamped and names who made it |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-48-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Reject "Showcase" with reason "Too small". |
| Test Data | Pending "Showcase" |
| Expected Result | The decision history holds one entry: DECISION, REJECTED, "Too small", a valid time, decided by Vera Venue (Venue Staff). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-decision.e2e-spec.ts::returns a decision history entry naming the staff member`<br>Unit: `src/bookings/bookings-decision.service.spec.ts::BookingsService decisions (US-22) AC-4: the decision is timestamped and attributed` |

### TC-S2-52

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-52 |
| Story/AC ref | Story 22 AC-5 |
| Test Scenario | The Coordinator and the event's Organiser can see the decision and reason; others can't |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-48-setup.sql + tc-s2-52-setup.sql on testDB (reset before test). Logged in as coord.a@example.com; organiser@example.com; other.organiser@example.com. |
| Test Steps | 1. As Venue Staff, reject "Showcase" with "Under maintenance".<br>2. Open the event's venue requests as the Coordinator, the Organiser and another Organiser. |
| Test Data | Pending "Showcase"; a second Organiser (tc-s2-52) |
| Expected Result | The Coordinator and the Organiser see REJECTED with the reason and its history, and each got a notification. The other Organiser sees nothing. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-decision.e2e-spec.ts::shows it to both on GET /bookings/events/:eventId, and notifies both`<br>Integration: `test/bookings-decision.e2e-spec.ts::hides it from an unrelated Organiser`<br>Unit: `src/bookings/bookings-decision.service.spec.ts::BookingsService decisions (US-22) AC-5: the Coordinator and Organiser are told` |

### TC-S2-53

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-53 |
| Story/AC ref | Story 22 AC-6 |
| Test Scenario | Reversing a decision is a new recorded action, with a reason, and keeps the original |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-48-setup.sql + tc-s2-55-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Approve "Showcase" with note "OK", then reverse it with "Venue flooded".<br>2. Try reversing without a reason, and reversing a request nobody has decided.<br>3. Reject "First", approve the overlapping "Second", then reverse "First". |
| Test Data | Pending "Showcase"; pending "First" 09:00-12:00 and "Second" 10:00-13:00 on Main Hall |
| Expected Result | The reversal makes it REJECTED and the history shows both entries, the approval first. No reason is refused (400); reversing an undecided request is refused (409). Reversing "First" into an approval is refused (409) because "Second" now holds the slot. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-decision.e2e-spec.ts::keeps the original decision and appends the reversal`<br>Integration: `test/bookings-decision.e2e-spec.ts::requires a reason to reverse`<br>Integration: `test/bookings-decision.e2e-spec.ts::refuses to reverse a request that has not been decided (409)`<br>Integration: `test/bookings-decision.e2e-spec.ts::re-checks the slot when a rejection is reversed into an approval`<br>Unit: `src/bookings/bookings-decision.service.spec.ts::BookingsService decisions (US-22) AC-6: a reversal is a new recorded action`<br>Integration: `test/bookings-decision.e2e-spec.ts::US-22 AC-2: whitespace-only reverse reason refused`<br>Integration: `test/bookings-decision.e2e-spec.ts::US-22 AC-2: a normal reverse reason is still saved`<br>UI: `frontend/src/features/bookings/components/booking-decision-reasons.test.tsx::US-22 AC-2: whitespace-only reverse reason refused`<br>UI: `frontend/src/features/bookings/components/booking-decision-reasons.test.tsx::US-22 AC-2: a normal reverse reason is sent, trimmed` |

### TC-S2-54

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-54 |
| Story/AC ref | Story 22 AC-7 |
| Test Scenario | The same request cannot be decided twice, even by a double click |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-48-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Approve "Showcase", then approve or reject it again.<br>2. (Reset) Send two approvals at the same moment. |
| Test Data | Pending "Showcase" |
| Expected Result | The second decision is refused (409) and only one decision is recorded, in both cases. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The "action is disabled/hidden" part of AC-7 is about the screen: TC-S2-81 (manual). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-decision.e2e-spec.ts::refuses a second approve or reject (409) and records nothing more`<br>Integration: `test/bookings-decision.e2e-spec.ts::lets only one of two simultaneous approvals through`<br>Unit: `src/bookings/bookings-decision.service.spec.ts::BookingsService decisions (US-22) AC-7: the same request cannot be decided twice` |

### TC-S2-55

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-55 |
| Story/AC ref | Story 22 AC-3 (with Story 23 AC-5) |
| Test Scenario | Approving checks the slot is still free |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-55-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Approve "First".<br>2. Approve "Second", which overlaps it. |
| Test Data | Pending "First" 09:00-12:00 and "Second" 10:00-13:00 on Main Hall |
| Expected Result | "Second" is refused (409), naming "First" as the conflict, and stays pending. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-decision.e2e-spec.ts::refuses to approve a second, overlapping request`<br>Unit: `src/bookings/bookings-decision.service.spec.ts::BookingsService decisions (US-22) approval keeps the venue free of double-commitment` |

### TC-S2-81

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-81 |
| Story/AC ref | Story 22 AC-1, AC-2, AC-7 |
| Test Scenario | Approve and reject from the request detail view; the actions disappear once decided |
| Pre-conditions | UI tests: API mocked. Browser test (TC-S2-187): run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-34-setup.sql + tc-s2-38-setup.sql on testDB (reset before test). |
| Test Steps | 1. Open a pending request's detail page.<br>2. Choose Reject: check Submit is disabled, enter a reason and submit.<br>3. (Another request) Choose Approve and submit without a note.<br>4. Open a decided request. |
| Test Data | A pending request on Main Hall; reason "Venue closed for repairs" |
| Expected Result | Approve and Reject are offered on the detail page. Reject can't be submitted until it has a reason; Approve needs no note. Once decided, Approve and Reject are no longer offered, only the recorded decision (and a reversal). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | As expected. |
| Status | Pass |
| Remarks | Was manual; now automated by UI tests and the browser journey TC-S2-187. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | UI: `frontend/src/features/bookings/components/booking-decision-panel.test.tsx::needs a reason before a rejection can be submitted`<br>UI: `frontend/src/features/bookings/components/booking-decision-panel.test.tsx::approves without a note, the note being optional`<br>UI: `frontend/src/features/bookings/components/booking-decision-panel.test.tsx::offers no Approve or Reject once the request is decided`<br>E2E: `e2e/us20-us23-bookings.spec.ts::a request travels from the Coordinator to Venue Staff and back with its decision` |

### TC-S2-187

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-187 |
| Story/AC ref | Story 20 AC-1, AC-5, AC-6; Story 21 AC-1, AC-6, AC-7; Story 22 AC-1, AC-2, AC-5, AC-7; Story 23 AC-3 (UI) |
| Test Scenario | On screen, a booking request goes from the Coordinator to Venue Staff, is decided, and the Coordinator sees the decision |
| Pre-conditions | Browser test: run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-34-setup.sql + tc-s2-38-setup.sql on testDB (reset before test). Logged in as coord.a@example.com, then venue.staff@example.com, then coord.a again. |
| Test Steps | 1. The Coordinator requests Main Hall for Orientation and opens their venue requests.<br>2. Venue Staff open the request from the pending queue.<br>3. They choose Reject, give a reason and submit.<br>4. They check the Pending and Decided views.<br>5. The Coordinator opens the request. |
| Test Data | `EVT-102` Orientation; `BKG-030` Hackathon, pending, overlapping; reason "Main Hall is closed that morning" |
| Expected Result | The request is submitted with a warning naming Hackathon and appears in the Coordinator's requests. Venue Staff see it in Pending with its requirements and the pending overlap as a warning. Reject needs a reason; once decided, Approve and Reject are gone and it moves to Decided. The Coordinator sees the rejection and its reason. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | As expected. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | E2E: `e2e/us20-us23-bookings.spec.ts::a request travels from the Coordinator to Venue Staff and back with its decision` |

**US-22 AC ↔ code notes**

- **AC-2 (fixed since 18 Oct):** a reason of only spaces is refused (TC-S2-49, Fail → Pass).

---

## Story 23: Overlapping Booking Detection (Venue Staff)

### TC-S2-56

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-56 |
| Story/AC ref | Story 23 AC-1, AC-4 |
| Test Scenario | The check compares the request with every booking on the venue, and names each conflict |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-56-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Check conflicts for each of the five pending requests. |
| Test Data | Five venues, each with a pending request 09:00-12:00 and a confirmed booking that ends at 09:00, starts at 12:00, overlaps by a minute, sits inside, or covers it |
| Expected Result | Touching bookings (ending at 09:00 or starting at 12:00) are not conflicts; the other three are. The "inside" conflict is named as "Gala", 10:00-11:00. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-conflicts.e2e-spec.ts::a confirmed booking that %s: conflict = %s`<br>Integration: `test/bookings-conflicts.e2e-spec.ts::names the event and time range of each conflict`<br>Unit: `src/bookings/booking-conflicts.spec.ts::US-23 overlapping booking detection classifyConflicts` |

### TC-S2-57

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-57 |
| Story/AC ref | Story 23 AC-2, AC-3 |
| Test Scenario | Confirmed overlaps are hard conflicts, pending ones are soft, and the two are kept apart |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-57-setup.sql + tc-s2-55-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Check conflicts for "Target".<br>2. Check conflicts for "First" (only a pending overlap). |
| Test Data | "Target" 09:00-12:00 with confirmed "Confirmed", pending "Pending" and rejected "Turned down" around it; tc-s2-55 |
| Expected Result | "Confirmed" is listed as hard and "Pending" as soft; the rejected booking and "Target" itself are not listed. "First" has a soft conflict ("Second") and no hard conflict. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-conflicts.e2e-spec.ts::lists confirmed overlaps as hard and pending ones as soft, ignoring rejected ones and itself`<br>Integration: `test/bookings-conflicts.e2e-spec.ts::reports a pending-only overlap as soft, without a hard conflict`<br>Unit: `src/bookings/booking-conflicts.spec.ts::US-23 overlapping booking detection classifyConflicts` |

### TC-S2-58

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-58 |
| Story/AC ref | Story 23 AC-1, AC-2 |
| Test Scenario | A blocked-out period (Story 16) overlapping the request is a hard conflict |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-48-setup.sql + tc-s2-58-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Check conflicts for "Showcase". |
| Test Data | Pending "Showcase" 09:00-12:00; block "Maintenance" 11:00-15:00 on Main Hall |
| Expected Result | The block is listed with its reason and times, and the request is marked as hard-conflicting. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-conflicts.e2e-spec.ts::lists an overlapping block, and marks the request as hard-conflicting` |

### TC-S2-59

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-59 |
| Story/AC ref | Story 23 AC-1 |
| Test Scenario | A request with nothing around it has no conflicts |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-48-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Check conflicts for "Showcase". |
| Test Data | Pending "Showcase" only |
| Expected Result | Empty hard, soft and block lists; no hard conflict. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-conflicts.e2e-spec.ts::reports nothing` |

### TC-S2-60

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-60 |
| Story/AC ref | Story 23 Access |
| Test Scenario | Only the venue's own Venue Staff can run the check |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-48-setup.sql + tc-s2-01-setup.sql on testDB (reset before test). Logged in as venue.staff.b@example.com; coord.a@example.com. |
| Test Steps | 1. Check conflicts for "Showcase" as Victor Venue, then as the Coordinator. |
| Test Data | Pending "Showcase" on Main Hall (Vera Venue's) |
| Expected Result | Victor Venue gets not found (404); the Coordinator is refused (403). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-conflicts.e2e-spec.ts::hides the booking from another Venue Staff member (404)`<br>Integration: `test/bookings-conflicts.e2e-spec.ts::refuses a Coordinator (403)` |

### TC-S2-61

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-61 |
| Story/AC ref | Story 23 AC-5 |
| Test Scenario | A request that hard-conflicts cannot be approved until the conflicting booking is resolved |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-48-setup.sql + tc-s2-61-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Approve "Showcase".<br>2. Reverse "Confirmed" with reason "Event moved online", then approve "Showcase" again. |
| Test Data | Pending "Showcase" 09:00-12:00; confirmed "Confirmed" 11:00-13:00 on Main Hall |
| Expected Result | The first approval is refused (409, BOOKING_HARD_CONFLICT, naming "Confirmed"); nothing is recorded and the request stays pending. After the reversal, the approval succeeds. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | AC-5 also says "or reassign": there is no way to move the conflicting booking to another time or venue; it can only be reversed. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-conflicts.e2e-spec.ts::refuses approval with 409 and leaves the request pending`<br>Integration: `test/bookings-conflicts.e2e-spec.ts::allows approval once the conflicting booking has been reversed` |

### TC-S2-62

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-62 |
| Story/AC ref | Story 23 AC-3, AC-5 |
| Test Scenario | A soft conflict warns but does not block approval |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-55-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Approve "First". |
| Test Data | Pending "First" 09:00-12:00 and "Second" 10:00-13:00 |
| Expected Result | Approved, with an OVERLAPS_PENDING_REQUEST warning naming "Second". |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-conflicts.e2e-spec.ts::approves with a warning naming the pending request` |

### TC-S2-63

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-63 |
| Story/AC ref | Story 23 AC-5 |
| Test Scenario | Approval re-checks at that moment, not trusting what the page showed earlier |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-55-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Check conflicts for "First" (soft only).<br>2. Approve "Second".<br>3. Approve "First". |
| Test Data | tc-s2-55 |
| Expected Result | The check first shows no hard conflict, but the approval of "First" is refused (409) because "Second" was approved meanwhile. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-conflicts.e2e-spec.ts::catches a conflict that appeared after the page loaded` |

### TC-S2-64

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-64 |
| Story/AC ref | Story 23 AC-5 |
| Test Scenario | Two overlapping bookings can never both be confirmed, even at the same moment or by writing to the database directly |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-55-setup.sql + tc-s2-48-setup.sql + tc-s2-61-setup.sql + tc-s2-64-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Approve "First" and "Second" at the same moment.<br>2. Set "Showcase" to APPROVED directly in the database while "Confirmed" overlaps it.<br>3. Load tc-s2-64 (back-to-back confirmed, overlapping pending). |
| Test Data | tc-s2-55; tc-s2-48 + tc-s2-61; tc-s2-64 |
| Expected Result | Exactly one approval succeeds, the other is refused (409). The direct write fails with the database constraint (23P01). The tc-s2-64 rows all load. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/bookings-conflicts.e2e-spec.ts::lets exactly one of two simultaneous overlapping approvals through`<br>Integration: `test/bookings-conflicts.e2e-spec.ts::is backed by the database: a direct write of an overlapping APPROVED booking fails`<br>Integration: `test/bookings-conflicts.e2e-spec.ts::still allows back-to-back APPROVED bookings and overlapping pending ones`<br>Unit: `src/bookings/booking-conflicts.spec.ts::US-23 overlapping booking detection database backstop (SQLSTATE 23P01)` |

### TC-S2-65

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-65 |
| Story/AC ref | Story 23 AC-5 |
| Test Scenario | The migration adding the database constraint refuses to run over existing double bookings |
| Pre-conditions | None from test/fixtures/sql: each test creates a throwaway schema in testDB with its own VenueBooking rows, runs the migration on it, then drops it. |
| Test Steps | 1. Run the migration over clean rows.<br>2. Run it over rows with two clashing pairs of confirmed bookings.<br>3. Run it over a confirmed booking that ends before it starts. |
| Test Data | Rows created per test (see the test file) |
| Expected Result | Clean rows: the constraint is added and every row is kept. Clashing rows: the migration stops, names each pair, and changes nothing. The backwards row is reported too. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The migration folder keeps the old label (us24); migration folders are never renamed. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/booking-overlap-migration.e2e-spec.ts::US-23: adds the constraint when existing data is clean (back-to-back and pending overlaps are fine)`<br>Integration: `test/booking-overlap-migration.e2e-spec.ts::US-23: stops and lists existing overlapping APPROVED bookings, changing nothing`<br>Integration: `test/booking-overlap-migration.e2e-spec.ts::US-23: also reports APPROVED bookings whose end is before their start` |

### TC-S2-66

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-66 |
| Story/AC ref | Story 23 AC-6 |
| Test Scenario | Overlap detection accounts for buffer/setup time between events, if configured for the venue |
| Pre-conditions | The cited tests create their own rows (Sprint 3/4 test files, not yet on setup scripts). Main Hall has 30 minutes' setup and 45 minutes' turnaround, and a confirmed booking 10:00-12:00. |
| Test Steps | 1. Request a slot overlapping only the booking's turnaround (12:00-12:45), then only its setup (09:30-10:00).<br>2. Request one whose occupied time only touches the booking's.<br>3. Approve a pending request that clashes once buffers count.<br>4. Open the conflicts as Venue Staff. |
| Test Data | Setup 30 min, turnaround 45 min (the customer's example) |
| Expected Result | Steps 1 and 3 are refused as conflicts; step 2 is allowed; Venue Staff see the buffer clash as a hard conflict. A venue with no buffers set behaves as before. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | As expected. |
| Status | Pass |
| Remarks | Was N/A on 18 Oct (the customer had said buffers were not needed). Sprint 4 added them (US-49 sets a venue's setup and turnaround; US-50 counts them in every overlap check), so this AC is now met and tested. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/venues-buffers.e2e-spec.ts::refuses a request that only overlaps the existing booking's turnaround (12:00–12:45)`<br>Integration: `test/venues-buffers.e2e-spec.ts::refuses a request that only overlaps the existing booking's setup (09:30–10:00)`<br>Integration: `test/venues-buffers.e2e-spec.ts::accepts a request whose occupied window only touches the existing one`<br>Integration: `test/venues-buffers.e2e-spec.ts::refuses to approve a pending request that clashes once buffers count`<br>Integration: `test/venues-buffers.e2e-spec.ts::reports the buffer clash to Venue Staff as a hard conflict`<br>Integration: `test/venues-buffers.e2e-spec.ts::allows back-to-back bookings at a venue with no buffers` |

### TC-S2-67

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-67 |
| Story/AC ref | Story 23 AC-7 |
| Test Scenario | If the requested time is edited, the overlap check re-runs against the new time before proceeding |
| Pre-conditions | The cited tests create their own rows (Sprint 3/4 test files, not yet on setup scripts). An approved event with a confirmed Main Hall booking, and a pending change request moving it to a new time. |
| Test Steps | 1. Open the change request (the check runs at the new time).<br>2. Book Main Hall at the new time for another event after the request was opened, then approve it.<br>3. Approve a clash-free change and look at the event's bookings. |
| Test Data | A change request moving the event's date and time |
| Expected Result | The check reports a clash at the new time; approval re-checks and is refused (409) while the clash exists; a clash-free approval moves the booking to the new time as a new pending request, which Venue Staff approve with the overlap check run again. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | As expected. |
| Status | Pass |
| Remarks | Was Fail (no way to edit a request's time). A booking's time now changes only when its event's time changes through an approved change request (Story 37, with Sprint 3's US-48 check), and the overlap check runs at the new time before anything is confirmed. There is still no way to edit one request's time on its own. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-change-request-check.e2e-spec.ts::reports a clash with another event’s booking at the new time`<br>Integration: `test/events-change-request-check.e2e-spec.ts::reports a clash that exists only through setup or turnaround time`<br>Integration: `test/events-change-request-check.e2e-spec.ts::stale page: a booking taken after the request was opened refuses the approval with 409`<br>Integration: `test/events-change-request-check.e2e-spec.ts::moves everything to the new details, keeps the originals linked, and records it` |

### TC-S2-82

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-82 |
| Story/AC ref | Story 23 AC-1, AC-2, AC-3, AC-4, AC-5 |
| Test Scenario | See hard and soft conflicts while reviewing a request |
| Pre-conditions | Browser test: run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-48-setup.sql + tc-s2-61-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. UI tests: API mocked. |
| Test Steps | 1. Open the pending Showcase request, which a confirmed booking overlaps.<br>2. (UI) Open requests with only a pending overlap, and with none; approve one after a conflict appears. |
| Test Data | `BKG-031` Showcase, pending, 09:00-12:00; `BKG-048` "Confirmed", approved, 11:00-13:00 |
| Expected Result | The confirmed overlap is named, Approve is unavailable and Reject stays available. A pending overlap is a warning only. Approval re-checks first and stops if a hard conflict has appeared. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | As expected. |
| Status | Pass |
| Remarks | Was manual; now automated by UI and browser tests. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | E2E: `e2e/us20-us23-bookings.spec.ts::a request overlapping a confirmed booking shows the clash and cannot be approved`<br>UI: `frontend/src/features/bookings/components/booking-decision-panel.test.tsx::US-23: a hard conflict disables Approve, says why, and leaves Reject available`<br>UI: `frontend/src/features/bookings/components/booking-decision-panel.test.tsx::US-23: a soft conflict is a warning only and never disables Approve`<br>UI: `frontend/src/features/bookings/components/booking-decision-panel.test.tsx::US-23 AC-5: re-checks just before approving, and stops if a hard conflict appeared`<br>UI: `frontend/src/features/bookings/components/booking-decision-panel.test.tsx::US-23: a 409 from approval refreshes the conflicts and explains what changed`<br>UI: `frontend/src/features/bookings/components/booking-decision-panel.test.tsx::US-23: approves normally when nothing is in the way` |

**US-23 AC ↔ code notes**

- **AC-6 (now in scope):** buffer time was set aside on 18 Oct; Sprint 4 added it, and overlap checks count it (TC-S2-66, N/A → Pass).
- **AC-7:** a request's time changes only through an approved event change, which re-runs the check at the new time (TC-S2-67, Fail → Pass). There is no separate "edit this request's time".
- **AC-5, "or reassign":** a conflicting booking can be reversed, not moved to another time or venue.
- **Relabelled in this regeneration:** the decision panel's UI tests used the app-code label (US-24); they now use Story 23.

---

## Story 24: Update event information during planning (Event Coordinator)

### TC-S2-68

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-68 |
| Story/AC ref | Story 24 AC-1 |
| Test Scenario | The assigned Coordinator's edits to an event in planning are saved |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-68-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Edit the programme and expected attendance (350).<br>2. (Reset) Edit only the attendance. |
| Test Data | Event "Freshman Orientation 2030", PLANNING, 320 expected, "Two projectors" |
| Expected Result | Both values are saved and returned; fields not sent (name, equipment) are unchanged; the status stays PLANNING. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-planning-history.e2e-spec.ts::saves the programme and attendance to the event record`<br>Integration: `test/events-planning-history.e2e-spec.ts::leaves fields that were not sent untouched`<br>Integration: `test/events-planning-history.e2e-spec.ts::does not change the status` |

### TC-S2-69

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-69 |
| Story/AC ref | Story 24 AC-1 |
| Test Scenario | Invalid planning edits are refused |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-68-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Set the name to empty, then to null.<br>2. Set the end to 08:00, before the stored 09:00 start. |
| Test Data | tc-s2-68 event |
| Expected Result | Each is refused (400), naming the problem; nothing is saved. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-planning-history.e2e-spec.ts::rejects emptying a required field`<br>Integration: `test/events-planning-history.e2e-spec.ts::rejects an end before the stored start` |

### TC-S2-70

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-70 |
| Story/AC ref | Story 24 AC-1 |
| Test Scenario | Only the assigned Coordinator can make planning edits, and only once planning has started |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-68-setup.sql + tc-s2-70-setup.sql on testDB (reset before test). Logged in as coord.a@example.com; coord.b@example.com; organiser@example.com. |
| Test Steps | 1. Edit the UNDER_REVIEW event.<br>2. Edit the planning event as another Coordinator, and as the Organiser.<br>3. Start planning on the APPROVED event, then edit it. |
| Test Data | tc-s2-68 event; "Still under review" (UNDER_REVIEW) and "Approved, not yet planning" (APPROVED) |
| Expected Result | Not in planning: refused (409). Other Coordinator: not found (404). Organiser: refused (403). Starting planning moves the approved event to PLANNING, after which it can be edited. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-planning-history.e2e-spec.ts::refuses an event that is not in planning (409)`<br>Integration: `test/events-planning-history.e2e-spec.ts::hides the event from a Coordinator it is not assigned to (404)`<br>Integration: `test/events-planning-history.e2e-spec.ts::refuses the Organiser, even for their own event (403)`<br>Integration: `test/events-planning-history.e2e-spec.ts::moves an approved event into planning, after which it can be edited` |

### TC-S2-71

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-71 |
| Story/AC ref | Story 24 AC-2 |
| Test Scenario | A change affecting an already-confirmed venue booking is flagged for review |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-68-setup.sql + tc-s2-71-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Change the expected attendance to 500.<br>2. Open the event's history. |
| Test Data | tc-s2-68 event with an APPROVED booking on Main Hall |
| Expected Result | The change is saved and flagged: requires review, affecting VENUE_BOOKING. The history entry carries the same flag. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | AC-2 does not say who reviews the flag or how it is cleared; neither is built. AC-2 also names "venue": the venue is not an event field, so it cannot change through a planning edit; it changes only through a new booking request (Story 20). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-planning-history.e2e-spec.ts::flags an attendance change when the venue booking is approved`<br>Integration: `test/events-planning-history.e2e-spec.ts::keeps the flag on the history entry` |

### TC-S2-72

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-72 |
| Story/AC ref | Story 24 AC-2 |
| Test Scenario | A date change is flagged against every confirmed arrangement |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-68-setup.sql + tc-s2-71-setup.sql + tc-s2-72-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Move the event to 2 Oct 2030. |
| Test Data | APPROVED venue booking and APPROVED projector reservation |
| Expected Result | Flagged, affecting VENUE_BOOKING and EQUIPMENT_RESERVATION. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-planning-history.e2e-spec.ts::flags a date change against both venue and equipment` |

### TC-S2-73

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-73 |
| Story/AC ref | Story 24 AC-2 |
| Test Scenario | Changes nothing confirmed depends on are ordinary |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-68-setup.sql + tc-s2-73-setup.sql + tc-s2-71-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. With only a REQUESTED booking, change the attendance.<br>2. With an APPROVED booking, change only the programme. |
| Test Data | tc-s2-73 (requested booking); tc-s2-71 (approved booking) |
| Expected Result | Neither change is flagged (requires review false, no arrangements listed). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-planning-history.e2e-spec.ts::treats the change as ordinary when the booking is only requested`<br>Integration: `test/events-planning-history.e2e-spec.ts::treats a programme change as ordinary even with confirmed arrangements` |

### TC-S2-74

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-74 |
| Story/AC ref | Story 24 AC-3 |
| Test Scenario | Relevant users see the latest saved information, and only for events related to them |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-68-setup.sql + tc-s2-71-setup.sql + tc-s2-74-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com; tech.support@example.com; coord.a@example.com. |
| Test Steps | 1. Edit the event (attendance 500, equipment "Three projectors", programme).<br>2. Open it as Venue Staff, Technical Support and the Coordinator.<br>3. List events as Venue Staff; open an event with no booking as Venue Staff. |
| Test Data | tc-s2-71 (booking on Main Hall); tc-s2-74 (requested projector reservation; "Unrelated event") |
| Expected Result | Each sees the updated values. Venue Staff's list holds only the booked event; an event with no booking on their venues is not found (404). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-planning-history.e2e-spec.ts::shows Venue Staff the updated event when it has a booking`<br>Integration: `test/events-planning-history.e2e-spec.ts::shows Technical Support the updated equipment needs`<br>Integration: `test/events-planning-history.e2e-spec.ts::lists only related events for Venue Staff`<br>Integration: `test/events-planning-history.e2e-spec.ts::hides an event with no booking from Venue Staff (404)`<br>Integration: `test/events-planning-history.e2e-spec.ts::shows the assigned Coordinator the update too` |

---

## Story 25: View history of changes made to an event's information (Event Coordinator)

### TC-S2-75

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-75 |
| Story/AC ref | Story 25 AC-1 |
| Test Scenario | Changes made through the app are listed oldest first, and a save that changed nothing is not recorded |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-68-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Edit attendance (350), then programme, then attendance (400); open the history.<br>2. (Reset) Save attendance 320 (unchanged); open the history. |
| Test Data | tc-s2-68 event |
| Expected Result | Three entries in the order made (attendance, programme, attendance), with times in order. The unchanged save records nothing. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-planning-history.e2e-spec.ts::lists changes oldest first`<br>Integration: `test/events-planning-history.e2e-spec.ts::does not record a save that changed nothing` |

### TC-S2-76

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-76 |
| Story/AC ref | Story 25 AC-1 |
| Test Scenario | The history is in time order whatever order the changes were stored in |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-68-setup.sql + tc-s2-76-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Open the event's history. |
| Test Data | Three recorded changes dated 2, 3 and 1 Oct 2026, stored in that order |
| Expected Result | Listed 1, 2, 3 Oct (CHG-001, -second, -third). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-planning-history.e2e-spec.ts::sorts recorded changes by time, whatever order they were stored in` |

### TC-S2-77

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-77 |
| Story/AC ref | Story 25 AC-1 |
| Test Scenario | An Organiser's amendments to a returned request appear in the history |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-68-setup.sql + tc-s2-77-setup.sql on testDB (reset before test). Logged in as organiser@example.com; coord.a@example.com. |
| Test Steps | 1. As the Organiser, change the returned request's attendance to 250.<br>2. As the Coordinator, open its history. |
| Test Data | "Freshman Orientation 2030", RETURNED |
| Expected Result | One entry, made by the Organiser. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-planning-history.e2e-spec.ts::includes an Organiser's amendments to a returned request` |

### TC-S2-78

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-78 |
| Story/AC ref | Story 25 Access |
| Test Scenario | Only Coordinators who can see the event can read its history |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-68-setup.sql on testDB (reset before test). Logged in as coord.b@example.com; organiser, venue staff, tech support, attendee. |
| Test Steps | 1. Open the history as another Coordinator.<br>2. Open it as each other role. |
| Test Data | tc-s2-68 event |
| Expected Result | Other Coordinator: not found (404). Every other role: refused (403). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-planning-history.e2e-spec.ts::is not available to a Coordinator who cannot see the event (404)`<br>Integration: `test/events-planning-history.e2e-spec.ts::is refused to %s (403)` |

### TC-S2-79

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-79 |
| Story/AC ref | Story 25 AC-2 |
| Test Scenario | Each entry shows what changed, the previous and new values, who and when |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-68-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Change attendance to 350 and the end to 18:00 in one save; open the history. |
| Test Data | tc-s2-68 event (320 expected, ends 17:00) |
| Expected Result | One entry listing end 17:00 -> 18:00 and attendance 320 -> 350, made by Cody Coordinator (with email and role), with a valid time. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-planning-history.e2e-spec.ts::records every changed field with its previous and new value` |

### TC-S2-80

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-80 |
| Story/AC ref | Story 25 AC-3 |
| Test Scenario | An event with no changes says so |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-68-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Open the history of an unedited event. |
| Test Data | tc-s2-68 event |
| Expected Result | An empty list with the message "No changes have been recorded for this event since it was created." |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-planning-history.e2e-spec.ts::says so explicitly` |

---

## Story 26: Have an event reassigned when my availability changes (Event Coordinator)

### TC-S2-83

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-83 |
| Story/AC ref | Story 26 AC-1 |
| Test Scenario | Requesting reassignment offers the other Coordinators to choose from |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-83-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator). |
| Test Steps | 1. Open the reassignment choices for "Freshman Orientation 2030". |
| Test Data | Event in planning, assigned to Cody; base users (two Coordinators, one of every other role) |
| Expected Result | Only Casey Coordinator is offered: not Cody, and no user without the Coordinator role. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-reassign.e2e-spec.ts::lists the other Coordinators only, not the requester` |

### TC-S2-84

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-84 |
| Story/AC ref | Story 26 AC-1 |
| Test Scenario | Only the responsible Coordinator can request reassignment, and only while the event is active |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-83-setup.sql + tc-s2-84-setup.sql on testDB (reset before test). Logged in as coord.b@example.com; organiser@example.com; venue.staff@example.com; coord.a@example.com. |
| Test Steps | 1. As Casey (not responsible), open the choices and reassign.<br>2. As the Organiser and Venue Staff, do the same.<br>3. As Cody, reassign the COMPLETED event. |
| Test Data | tc-s2-83 event; "Finished event" (COMPLETED, tc-s2-84) |
| Expected Result | Casey, the Organiser and Venue Staff are refused (403) and the event keeps its Coordinator. The finished event is refused (409). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | AC-1 starts from "the Coordinator's availability has changed": the system has no record of availability, so any responsible Coordinator may ask. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-reassign.e2e-spec.ts::refuses a Coordinator who is not responsible for the event (403)`<br>Integration: `test/events-reassign.e2e-spec.ts::refuses %s (403)`<br>Integration: `test/events-reassign.e2e-spec.ts::refuses a finished event (409)` |

### TC-S2-85

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-85 |
| Story/AC ref | Story 26 AC-2 |
| Test Scenario | Confirming the reassignment makes the new Coordinator the assigned one |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-83-setup.sql on testDB (reset before test). Logged in as coord.a@example.com; coord.b@example.com. |
| Test Steps | 1. As Cody, reassign the event to Casey.<br>2. Open the event in each Coordinator's assigned view. |
| Test Data | tc-s2-83 event |
| Expected Result | The event's Coordinator is Casey; its status is still PLANNING. Casey can open it; Cody can no longer (404). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-reassign.e2e-spec.ts::hands the event to the selected Coordinator`<br>Integration: `test/events-reassign.e2e-spec.ts::moves the event between the two Coordinators' queues` |

### TC-S2-86

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-86 |
| Story/AC ref | Story 26 AC-2 |
| Test Scenario | Only a valid, different Coordinator can be chosen |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-83-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Reassign to Cody himself, to the Organiser, to an unknown id, and with no Coordinator. |
| Test Data | tc-s2-83 event |
| Expected Result | Himself, the Organiser and no choice are refused (400); the unknown id is not found (404). The event stays with Cody. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-reassign.e2e-spec.ts::rejects reassigning to yourself (400)`<br>Integration: `test/events-reassign.e2e-spec.ts::rejects a user who is not a Coordinator (400)`<br>Integration: `test/events-reassign.e2e-spec.ts::rejects an unknown user (404)`<br>Integration: `test/events-reassign.e2e-spec.ts::requires a coordinatorId (400)` |

### TC-S2-87

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-87 |
| Story/AC ref | Story 26 AC-3 |
| Test Scenario | The previous and new Coordinators are both notified |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-83-setup.sql on testDB (reset before test). Logged in as coord.a@example.com; coord.b@example.com. |
| Test Steps | 1. As Cody, reassign the event to Casey.<br>2. (Reset) As Casey, try to reassign it. |
| Test Data | tc-s2-83 event |
| Expected Result | One reassignment notification each for Cody and Casey. The refused attempt notifies nobody. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-reassign.e2e-spec.ts::notifies the previous and the new Coordinator`<br>Integration: `test/events-reassign.e2e-spec.ts::notifies nobody when the reassignment is refused` |

### TC-S2-88

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-88 |
| Story/AC ref | Story 26 AC-4 |
| Test Scenario | The reassignment is recorded in the event's change history |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-83-setup.sql on testDB (reset before test). Logged in as coord.a@example.com; coord.b@example.com. |
| Test Steps | 1. As Cody, reassign the event to Casey.<br>2. As Casey, open the event's history. |
| Test Data | tc-s2-83 event |
| Expected Result | One entry: Coordinator changed from Cody Coordinator to Casey Coordinator, made by Cody. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-reassign.e2e-spec.ts::shows who handed it over, from whom, to whom` |

---

## Story 27: Record equipment and technical requirements needed for an event (Event Coordinator)

### TC-S2-89

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-89 |
| Story/AC ref | Story 27 AC-1 |
| Test Scenario | Required equipment (type and quantity) is saved against the event |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-68-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Save 2 × Laser projector and 6 × Wireless microphone ("Lapel").<br>2. Save again with only 3 × Laser projector.<br>3. Save an empty list. |
| Test Data | Event in planning (tc-s2-68) |
| Expected Result | Both lines are saved with their quantities and notes. The second save replaces the list (one line, 3). The empty save clears it. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-technical-requirements.e2e-spec.ts::saves each line against the event`<br>Integration: `test/events-technical-requirements.e2e-spec.ts::replaces the list on a later save`<br>Integration: `test/events-technical-requirements.e2e-spec.ts::clears the list when sent empty` |

### TC-S2-90

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-90 |
| Story/AC ref | Story 27 AC-1 |
| Test Scenario | Invalid equipment lines are refused |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-68-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Save a line with no type; with quantity 0; with quantity 1.5.<br>2. Save a line whose type is three spaces.<br>3. Save "Mic" and "mic" together. |
| Test Data | Event in planning (tc-s2-68) |
| Expected Result | Each is refused (400) and nothing is saved; the duplicate is refused with a message to combine the quantities. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | The empty type, zero and fractional quantities and the duplicate are refused, but a type of three spaces is accepted (200) and saved as an empty type. |
| Status | Fail |
| Remarks | Bug: a type of only spaces is accepted and saved as an empty type, because EquipmentRequirementDto does not trim before checking. Captured with it.failing; fix by adding @Trim() above @IsNotEmpty(). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-technical-requirements.e2e-spec.ts::rejects %s (400) and saves nothing`<br>Integration: `test/events-technical-requirements.e2e-spec.ts::rejects a type made only of spaces (400)`<br>Integration: `test/events-technical-requirements.e2e-spec.ts::rejects the same type twice, whatever its case (400)` |

### TC-S2-91

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-91 |
| Story/AC ref | Story 27 AC-2 |
| Test Scenario | The technical support needed is saved against the event |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-68-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Save "On-site AV technician; hybrid setup with Zoom". |
| Test Data | Event in planning (tc-s2-68) |
| Expected Result | The description is saved on the event and returned. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-technical-requirements.e2e-spec.ts::saves the description against the event` |

### TC-S2-92

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-92 |
| Story/AC ref | Story 27 AC-1, AC-2 |
| Test Scenario | Only the assigned Coordinator records requirements, and only during planning |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-68-setup.sql + tc-s2-70-setup.sql on testDB (reset before test). Logged in as coord.a@example.com; coord.b@example.com; tech.support@example.com; organiser@example.com. |
| Test Steps | 1. Save requirements on the APPROVED (not yet planning) event.<br>2. Save them as Casey, as Technical Support and as the Organiser. |
| Test Data | tc-s2-68 and tc-s2-70 events |
| Expected Result | Not in planning: refused (409). Casey: not found (404). Technical Support and the Organiser: refused (403). Nothing is saved. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-technical-requirements.e2e-spec.ts::refuses an event that is not in planning (409)`<br>Integration: `test/events-technical-requirements.e2e-spec.ts::hides the event from a Coordinator it is not assigned to (404)`<br>Integration: `test/events-technical-requirements.e2e-spec.ts::refuses %s (403)` |

### TC-S2-93

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-93 |
| Story/AC ref | Story 27 AC-3 |
| Test Scenario | Technical Support (and the Coordinator) see the recorded requirements on the event |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-68-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech); coord.a@example.com. |
| Test Steps | 1. As the Coordinator, record equipment and "Hybrid setup".<br>2. Open the event as Technical Support, then in the Coordinator's assigned view. |
| Test Data | Event in planning (tc-s2-68) |
| Expected Result | Technical Support see the support needs and both equipment lines; the Coordinator's view lists both lines. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-technical-requirements.e2e-spec.ts::shows them on the event`<br>Integration: `test/events-technical-requirements.e2e-spec.ts::shows them to the Coordinator on the detail view` |

### TC-S2-94

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-94 |
| Story/AC ref | Story 27 AC-3 |
| Test Scenario | Events with recorded requirements appear in Technical Support's list |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-68-setup.sql + tc-s2-94-setup.sql + tc-s2-74-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Record equipment on "With equipment" and support on "Support only".<br>2. List events as Technical Support.<br>3. (Reset with tc-s2-74) List again. |
| Test Data | tc-s2-94: three planning events with nothing recorded; tc-s2-74: a requested reservation for the tc-s2-68 event |
| Expected Result | The list holds exactly "With equipment" and "Support only" (not "Nothing recorded", nor the tc-s2-68 event with only the Organiser's notes). With tc-s2-74, the event with only a reservation is listed. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | The Organiser's free-text equipment notes alone do not put an event in this list; Story 30 covers those on its own page. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-technical-requirements.e2e-spec.ts::lists an event once it has requirements, even with nothing reserved`<br>Integration: `test/events-technical-requirements.e2e-spec.ts::still lists an event that only has a reservation` |

### TC-S2-95

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-95 |
| Story/AC ref | Story 27 AC-3 |
| Test Scenario | Attendees never see the equipment or technical requirements |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-68-setup.sql + tc-s2-95-setup.sql on testDB (reset before test). Logged in as attendee@example.com. |
| Test Steps | 1. As the Coordinator, record requirements on "Open day".<br>2. Open it as an Attendee. |
| Test Data | "Open day" (planning, open for registration, tc-s2-95) |
| Expected Result | The Attendee sees the event without any equipment or technical support fields. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-technical-requirements.e2e-spec.ts::never shows them to an Attendee` |

### TC-S2-96

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-96 |
| Story/AC ref | Story 27 AC-1, AC-2 (with Story 25) |
| Test Scenario | Each requirements save is recorded in the event's history |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-68-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Save two equipment lines, then one line and "Hybrid".<br>2. Open the event's history. |
| Test Data | Event in planning (tc-s2-68) |
| Expected Result | Two entries. The second shows equipment from "2 × Laser projector, 6 × Wireless microphone (Lapel)" to "3 × Laser projector", and support from empty to "Hybrid". |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-technical-requirements.e2e-spec.ts::records each save with the before and after` |

---

## Story 28: View the equipment catalogue to know what's available (Technical Support Staff)

### TC-S2-97

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-97 |
| Story/AC ref | Story 28 AC-1 |
| Test Scenario | Every item is listed with its type, description, quantity and location |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-97-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Open the equipment catalogue. |
| Test Data | tc-s2-97: Wireless microphone, Projector (4K), Folding table (no description or location) |
| Expected Result | All three are listed, each with type, description, quantity and location; the folding table shows them as empty. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-browse.e2e-spec.ts::returns every item with its key details`<br>Integration: `test/equipment-browse.e2e-spec.ts::lists an item with no description or location, showing them as empty` |

### TC-S2-98

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-98 |
| Story/AC ref | Story 28 Access |
| Test Scenario | Only Technical Support can browse the catalogue |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-97-setup.sql on testDB (reset before test). Logged in as coord.a@example.com; organiser@example.com; attendee@example.com. |
| Test Steps | 1. Open the catalogue as each of those roles, and without logging in. |
| Test Data | tc-s2-97 |
| Expected Result | Other roles are refused (403); no login is refused (401). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-browse.e2e-spec.ts::refuses %s (403)`<br>Integration: `test/equipment-browse.e2e-spec.ts::refuses a request without a token (401)` |

### TC-S2-99

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-99 |
| Story/AC ref | Story 28 AC-2 |
| Test Scenario | Selecting an item shows its full details, including operational status |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-97-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech); coord.a@example.com. |
| Test Steps | 1. Open "Projector (4K)".<br>2. Open it as the Coordinator.<br>3. Open an unknown item. |
| Test Data | tc-s2-97 |
| Expected Result | The detail shows type, description, location, quantity and status Under maintenance (the list does not). The Coordinator is refused (403); the unknown item is not found (404). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-browse.e2e-spec.ts::includes the operational status`<br>Integration: `test/equipment-browse.e2e-spec.ts::refuses a Coordinator (403)`<br>Integration: `test/equipment-browse.e2e-spec.ts::reports an unknown item as not found (404)` |

### TC-S2-100

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-100 |
| Story/AC ref | Story 28 AC-3 |
| Test Scenario | An item can be found without scrolling: lookup by type and sorting |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-97-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Look up "PROJECTOR", then "drone".<br>2. Sort by type A-Z, then by quantity largest first.<br>3. Sort by an unknown field. |
| Test Data | tc-s2-97 |
| Expected Result | "PROJECTOR" finds only Projector (4K); "drone" finds nothing. By type: Folding table, Projector (4K), Wireless microphone. By quantity: Folding table, Wireless microphone, Projector (4K). The unknown field is refused (400). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-browse.e2e-spec.ts::looks up by a case-insensitive part of the type`<br>Integration: `test/equipment-browse.e2e-spec.ts::returns an empty list when nothing matches`<br>Integration: `test/equipment-browse.e2e-spec.ts::sorts by type, A to Z`<br>Integration: `test/equipment-browse.e2e-spec.ts::sorts by total quantity`<br>Integration: `test/equipment-browse.e2e-spec.ts::rejects a sort field outside the fixed list (400)` |

### TC-S2-101

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-101 |
| Story/AC ref | Story 28 AC-4 |
| Test Scenario | The catalogue shows the latest saved data whenever it is loaded |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-97-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Open the catalogue.<br>2. Add an item, then open it again.<br>3. Change the projector's status to Operational, then reopen it. |
| Test Data | tc-s2-97 |
| Expected Result | The new item appears on the next load (4 items); the projector shows Operational. Responses are marked not to be cached. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-browse.e2e-spec.ts::shows a newly saved item on the next load, and is not cached`<br>Integration: `test/equipment-browse.e2e-spec.ts::shows a changed operational status when the item is reopened` |

### TC-S2-102

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-102 |
| Story/AC ref | Story 28 AC-1, AC-2, AC-3 |
| Test Scenario | Browse, look up, sort and open items in the catalogue |
| Pre-conditions | Log in as tech.support@example.com on the running app. The catalogue has several items, at least one without a description or location. |
| Test Steps | 1. Open Equipment catalogue.<br>2. Type part of an item's type in the lookup.<br>3. Sort by type, then by quantity.<br>4. Click an item. |
| Test Data | Seed data on the running app |
| Expected Result | Each row shows type, description, quantity and location at a glance. The lookup narrows the list as you type; each sort reorders it. Clicking an item opens its full details, including its operational status. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result |  |
| Status | Not Executed |
| Remarks | Manual: the AC is about the user interface. |
| Executed By |  |
| Date of Execution |  |
| Automated by | Manual |

---

## Story 29: Check equipment availability for an event's date and time (Technical Support Staff)

### TC-S2-103

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-103 |
| Story/AC ref | Story 29 AC-1 |
| Test Scenario | See how many units of an item are free for a date and time |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-103-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Check Wireless microphone for 1 Oct 2030 09:00-17:00, 6 wanted. |
| Test Data | tc-s2-103: 24 microphones, nothing reserved |
| Expected Result | 24 available of 24, fully available, shortfall 0. The response is not cached. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-availability.e2e-spec.ts::returns the free count for the window` |

### TC-S2-104

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-104 |
| Story/AC ref | Story 29 Access |
| Test Scenario | Only Technical Support can check availability |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-103-setup.sql on testDB (reset before test). Logged in as coord.a@example.com; organiser@example.com; attendee@example.com; venue.staff@example.com. |
| Test Steps | 1. Check as each of those roles, and without logging in. |
| Test Data | tc-s2-103 |
| Expected Result | Other roles are refused (403); no login is refused (401). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-availability.e2e-spec.ts::refuses %s (403)`<br>Integration: `test/equipment-availability.e2e-spec.ts::refuses a request without a token (401)` |

### TC-S2-105

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-105 |
| Story/AC ref | Story 29 AC-1 |
| Test Scenario | The check needs a valid window, quantity and item |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-103-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Check with the end before the start; with no start; with start "not-a-date".<br>2. Check with quantity 0, -1 and 1.5.<br>3. Check an unknown item. |
| Test Data | tc-s2-103 |
| Expected Result | Each invalid input is refused (400); the unknown item is not found (404). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-availability.e2e-spec.ts::rejects an end that is not after the start (400)`<br>Integration: `test/equipment-availability.e2e-spec.ts::rejects a missing or malformed date (400)`<br>Integration: `test/equipment-availability.e2e-spec.ts::rejects a quantity of %s (400)`<br>Integration: `test/equipment-availability.e2e-spec.ts::reports an unknown item as not found (404)` |

### TC-S2-106

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-106 |
| Story/AC ref | Story 29 AC-2 |
| Test Scenario | Units reserved for an overlapping event are excluded, and only that item's |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-103-setup.sql + tc-s2-106-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Check Wireless microphone for 09:00-17:00. |
| Test Data | tc-s2-106: 10 microphones reserved 12:00-20:00; 4 PA systems reserved 09:00-17:00 |
| Expected Result | 10 reserved, 14 available (the PA reservation does not count against microphones). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-availability.e2e-spec.ts::subtracts this item's units reserved at an overlapping time, and only those` |

### TC-S2-107

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-107 |
| Story/AC ref | Story 29 AC-2 |
| Test Scenario | Reservations at other times, including back-to-back, are not excluded |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-103-setup.sql + tc-s2-107-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Check Wireless microphone for 09:00-17:00. |
| Test Data | tc-s2-107: 10 microphones each at 05:00-09:00, 17:00-19:00 and the next day |
| Expected Result | 0 reserved, 24 available. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-availability.e2e-spec.ts::ignores reservations at other times, including back-to-back ones` |

### TC-S2-108

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-108 |
| Story/AC ref | Story 29 AC-2 |
| Test Scenario | Only confirmed reservations are excluded |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-103-setup.sql + tc-s2-108-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Check Wireless microphone for 09:00-17:00. |
| Test Data | tc-s2-108: 5 microphones each requested, rejected and released for the whole window |
| Expected Result | 0 reserved, 24 available. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | "Already reserved" is read as a confirmed (approved) reservation; a request still awaiting approval holds nothing. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-availability.e2e-spec.ts::does not count requested, rejected or released reservations` |

### TC-S2-109

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-109 |
| Story/AC ref | Story 29 AC-2 |
| Test Scenario | Reservations that never overlap each other are not added together |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-103-setup.sql + tc-s2-109-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Check Wireless microphone for 09:00-17:00. |
| Test Data | tc-s2-109: 10 microphones 09:00-12:00 and 10 more 13:00-17:00 |
| Expected Result | 10 reserved (the most in use at once), 14 available, not 20 reserved. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-availability.e2e-spec.ts::counts the peak in use, not the sum, across separate time slots` |

### TC-S2-110

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-110 |
| Story/AC ref | Story 29 AC-3 |
| Test Scenario | Damaged or under-maintenance equipment is excluded |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-103-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Check Projector (4K) and Extension reel for 09:00-17:00. |
| Test Data | tc-s2-103: projector (8) under maintenance; reel (15) out of service |
| Expected Result | Neither has any units available; all are counted as unavailable; neither is fully available. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-availability.e2e-spec.ts::reports no free units for an item %s` |

### TC-S2-111

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-111 |
| Story/AC ref | Story 29 AC-4 |
| Test Scenario | The shortfall is shown when the request exceeds what is free |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-103-setup.sql + tc-s2-106-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Check Portable PA system for 09:00-17:00 wanting 1, 2, 3 and 6.<br>2. Check Extension reel wanting 3. |
| Test Data | tc-s2-106: 4 of 6 PA systems reserved, leaving 2 |
| Expected Result | PA: 1 and 2 are fully available (shortfall 0); 3 is short by 1; 6 is short by 4. Reel: short by the whole 3. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-availability.e2e-spec.ts::a request %s the free count (%s wanted): fully available %s, shortfall %s`<br>Integration: `test/equipment-availability.e2e-spec.ts::reports the whole request as the shortfall for damaged equipment` |

### TC-S2-112

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-112 |
| Story/AC ref | Story 29 AC-5 |
| Test Scenario | Several equipment types are checked for the same request, each with its own result |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-103-setup.sql + tc-s2-106-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. For 09:00-17:00, check 12 microphones, 3 PA systems and 1 projector together. |
| Test Data | tc-s2-106 |
| Expected Result | Microphone: 14 available, no shortfall. PA: 2 available, short by 1. Projector: 0 available, short by 1. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | The API checks one type per request; the availability page sends one request per equipment row (TC-S2-113, manual). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-availability.e2e-spec.ts::answers each type for the same window with its own count and shortfall` |

### TC-S2-113

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-113 |
| Story/AC ref | Story 29 AC-1, AC-4, AC-5 |
| Test Scenario | Check several equipment types for one date and time |
| Pre-conditions | Log in as tech.support@example.com. The catalogue has at least two operational items, one with some units reserved for an overlapping time. |
| Test Steps | 1. Open Check availability.<br>2. Enter a date and start/end time.<br>3. Choose one item and a quantity; add a second row with another item and a quantity larger than is free.<br>4. Check availability. |
| Test Data | Seed data on the running app |
| Expected Result | Each row shows its own free count for that time. The row asking for more than is free shows the shortfall; the other shows it is fully available. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result |  |
| Status | Not Executed |
| Remarks | Manual: the AC is about the user interface. |
| Executed By |  |
| Date of Execution |  |
| Automated by | Manual |

---

## Story 30: View equipment and technical requirements described for an event (Technical Support Staff)

### TC-S2-114

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-114 |
| Story/AC ref | Story 30 AC-1 |
| Test Scenario | Requirements are visible whether entered by the Organiser or recorded by the Coordinator |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-114-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Open the requirements of "Organiser Only", "Rows Only", "Notes Only" and "All Three". |
| Test Data | tc-s2-114 events (one per mix of the three sources) |
| Expected Result | Each shows its own sources: the Organiser's equipment needs, the Coordinator's rows (in the order entered), the support notes, or all three together. Responses are not cached. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-requirements.e2e-spec.ts::shows the Organiser's equipment needs on their own`<br>Integration: `test/equipment-requirements.e2e-spec.ts::shows the Coordinator's requirement rows on their own`<br>Integration: `test/equipment-requirements.e2e-spec.ts::shows the technical support notes on their own`<br>Integration: `test/equipment-requirements.e2e-spec.ts::shows all three sources together` |

### TC-S2-115

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-115 |
| Story/AC ref | Story 30 AC-1, AC-4 |
| Test Scenario | The list holds only submitted events with at least one requirement; drafts are hidden |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-114-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Open Event requirements (the list).<br>2. Open the draft's requirements and its details. |
| Test Data | tc-s2-114 |
| Expected Result | Exactly the four events with a source are listed: not "None Recorded" and not the draft. The draft cannot be opened (404). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | "Submitted" is read as any status except DRAFT, so rejected or cancelled events with requirements are listed too. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-requirements.e2e-spec.ts::lists exactly the non-draft events with at least one source`<br>Integration: `test/equipment-requirements.e2e-spec.ts::hides a draft from the requirements and details routes (404)` |

### TC-S2-116

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-116 |
| Story/AC ref | Story 30 AC-2 |
| Test Scenario | What was requested is shown, not just that a request exists |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-114-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Open the list and find "Rows Only".<br>2. Open the requirements of "All Three". |
| Test Data | tc-s2-114 |
| Expected Result | The list entry carries the two lines (2 × Laser projector; 6 × Wireless microphone, "Lapel"). The requirements view shows the requirements only, no other planning fields. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-requirements.e2e-spec.ts::carries the requirement content in the list itself`<br>Integration: `test/equipment-requirements.e2e-spec.ts::shows the requirements, not other planning fields` |

### TC-S2-117

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-117 |
| Story/AC ref | Story 30 AC-3 |
| Test Scenario | No requirements recorded is clearly indicated |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-114-setup.sql + tc-s2-117-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Open the requirements of "None Recorded".<br>2. Open those of "Blank Text". |
| Test Data | tc-s2-114; tc-s2-117 (text of only spaces) |
| Expected Result | Both say "No equipment or technical requirements have been recorded for this event." "Blank Text" is not in the list. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-requirements.e2e-spec.ts::says so for a submitted event with nothing recorded`<br>Integration: `test/equipment-requirements.e2e-spec.ts::treats text made only of spaces as nothing recorded` |

### TC-S2-118

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-118 |
| Story/AC ref | Story 30 Access |
| Test Scenario | Only Technical Support can view requirements |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-114-setup.sql on testDB (reset before test). Logged in as coord.a@example.com; organiser@example.com; attendee@example.com; venue.staff@example.com. |
| Test Steps | 1. Open the list, an event's requirements and its details as each of those roles, and without logging in. |
| Test Data | tc-s2-114 |
| Expected Result | Other roles are refused (403) on all three; no login is refused (401). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-requirements.e2e-spec.ts::refuses %s on the list, requirements and details routes (403)`<br>Integration: `test/equipment-requirements.e2e-spec.ts::refuses a request without a token (401)` |

### TC-S2-119

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-119 |
| Story/AC ref | Story 30 AC-1 (details view) |
| Test Scenario | "View more details" opens the full event for any submitted event |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-114-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Open the details of "Organiser Only", then of the other events.<br>2. Open an unknown event's details. |
| Test Data | tc-s2-114 |
| Expected Result | The details show the planning fields (dates, attendance, layout, accessibility, programme) and the Coordinator's name and email, without the requirement text or internal ids. Every non-draft event opens; the unknown one is not found (404). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-requirements.e2e-spec.ts::returns the full event details`<br>Integration: `test/equipment-requirements.e2e-spec.ts::opens for the %s event`<br>Integration: `test/equipment-requirements.e2e-spec.ts::reports an unknown event as not found (404)`<br>Integration: `test/equipment-requirements.e2e-spec.ts::does not expose the requirement text or internal fields` |

### TC-S2-120

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-120 |
| Story/AC ref | Story 30 AC-1, AC-2, AC-3, AC-4 |
| Test Scenario | Browse event requirements and open one |
| Pre-conditions | Log in as tech.support@example.com on the running app. There are submitted events with requirements, one with none, and a draft with requirements. |
| Test Steps | 1. Open Event requirements.<br>2. Open an event, then "View more details".<br>3. Open an event with nothing recorded (from its link or another view). |
| Test Data | Seed data on the running app |
| Expected Result | The list shows only submitted events with requirements (no draft), each with what was requested. An event shows the Organiser's and the Coordinator's requirements; one with none clearly says nothing has been recorded. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result |  |
| Status | Not Executed |
| Remarks | Manual: the AC is about the user interface. |
| Executed By |  |
| Date of Execution |  |
| Automated by | Manual |

---

## Story 31: Reserve available equipment for an event (Technical Support Staff)

### TC-S2-121

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-121 |
| Story/AC ref | Story 31 AC-1, AC-3 |
| Test Scenario | Commit equipment from an event and see a refusal's reason |
| Pre-conditions | Log in as tech.support@example.com. An event in planning; an item with some units already committed to an overlapping event. |
| Test Steps | 1. Open Event requirements and the event.<br>2. In "Commit equipment", choose an item and a quantity that is free; commit.<br>3. Commit more than is free. |
| Test Data | Seed data on the running app |
| Expected Result | The first commitment is confirmed on screen ("Committed N × …"). The second is refused with the reason shown, stating how many are free and how many are committed elsewhere. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result |  |
| Status | Not Executed |
| Remarks | Manual: the AC is about the user interface. |
| Executed By |  |
| Date of Execution |  |
| Automated by | Manual |

### TC-S2-122

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-122 |
| Story/AC ref | Story 31 AC-1 |
| Test Scenario | A selected item and quantity are committed to an event for its date and time |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-122-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Commit 4 Wireless microphones to "Capstone Showcase". |
| Test Data | tc-s2-122: 10 microphones; Capstone Showcase 1 Oct 2030 09:00-17:00 |
| Expected Result | Created (201) as a locked-in (approved) reservation of 4, for 09:00-17:00 on 1 Oct 2030. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-reservations.e2e-spec.ts::commits the quantity over the event's own window` |

### TC-S2-123

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-123 |
| Story/AC ref | Story 31 AC-1 |
| Test Scenario | Equipment cannot be committed to an event that is not live |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-122-setup.sql + tc-s2-123-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Commit a microphone to the draft, rejected, cancelled and completed events. |
| Test Data | tc-s2-123 |
| Expected Result | Each is refused (409), naming the event's status. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-reservations.e2e-spec.ts::refuses a %s event (409)` |

### TC-S2-124

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-124 |
| Story/AC ref | Story 31 AC-1 |
| Test Scenario | The commitment needs a real event, item and quantity |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-122-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Commit to an unknown event, and an unknown item.<br>2. Commit quantities 0, -1, 1.5 and "two". |
| Test Data | tc-s2-122 |
| Expected Result | Unknown event or item: not found (404). Each bad quantity: refused (400), nothing saved. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-reservations.e2e-spec.ts::reports an unknown event or item as not found (404)`<br>Integration: `test/equipment-reservations.e2e-spec.ts::rejects a quantity of %p (400)` |

### TC-S2-125

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-125 |
| Story/AC ref | Story 31 Access |
| Test Scenario | Only Technical Support can commit equipment |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-122-setup.sql on testDB (reset before test). Logged in as coord.a@example.com; organiser@example.com; attendee@example.com; venue.staff@example.com. |
| Test Steps | 1. Commit as each of those roles, and without logging in. |
| Test Data | tc-s2-122 |
| Expected Result | Other roles are refused (403) and nothing is saved; no login is refused (401). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-reservations.e2e-spec.ts::refuses %s (403) and commits nothing`<br>Integration: `test/equipment-reservations.e2e-spec.ts::refuses a request without a token (401)` |

### TC-S2-126

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-126 |
| Story/AC ref | Story 31 AC-2 |
| Test Scenario | Once committed, the quantity is locked for any overlapping period, and only that |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-122-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Commit 4 microphones to Capstone, then check availability for 16:00-18:00.<br>2. Commit 7 to Capstone, then 4 and 3 to the overlapping Industry Night.<br>3. Commit all 10 to Capstone, then to the back-to-back and next-day events, and PA systems to Industry Night.<br>4. Commit 6, then 5, then 4 more to Capstone itself. |
| Test Data | tc-s2-122 |
| Expected Result | The check straight away shows 4 reserved, 6 free. Industry Night: 4 refused (409), 3 accepted. Back-to-back, next-day and other-item commitments are accepted. Capstone's own: 5 refused, 4 accepted. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-reservations.e2e-spec.ts::is excluded from the very next availability check for an overlapping window`<br>Integration: `test/equipment-reservations.e2e-spec.ts::cannot be committed again to an overlapping event`<br>Integration: `test/equipment-reservations.e2e-spec.ts::does not lock non-overlapping periods, including back-to-back`<br>Integration: `test/equipment-reservations.e2e-spec.ts::locks only the item committed, not other items`<br>Integration: `test/equipment-reservations.e2e-spec.ts::counts the same event's earlier commitment too` |

### TC-S2-127

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-127 |
| Story/AC ref | Story 31 AC-2 |
| Test Scenario | Two simultaneous commitments can never together take more than exists |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-122-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Commit 6 microphones to Capstone and 6 to Industry Night at the same moment. |
| Test Data | tc-s2-122 (10 microphones) |
| Expected Result | One is accepted (201) and the other refused (409); exactly 6 are held. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-reservations.e2e-spec.ts::lets exactly one of two simultaneous over-committing requests through` |

### TC-S2-128

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-128 |
| Story/AC ref | Story 31 AC-3 |
| Test Scenario | Committing more than is free is rejected, with the reason shown |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-122-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. With 4 committed to Industry Night, commit 7 to Capstone, then exactly 6.<br>2. Commit the projector (under maintenance).<br>3. With all 10 held elsewhere, commit 1 to Capstone. |
| Test Data | tc-s2-122 |
| Expected Result | 7 is refused with "Only 6 of the 7 Wireless microphone requested are free for … 4 of 10 are already committed to an overlapping period."; 6 is accepted. The projector is refused because it is under maintenance. Nothing is saved when refused. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-reservations.e2e-spec.ts::rejects one unit more than is free, stating the counts`<br>Integration: `test/equipment-reservations.e2e-spec.ts::accepts exactly the free quantity (boundary)`<br>Integration: `test/equipment-reservations.e2e-spec.ts::rejects equipment under maintenance, saying so`<br>Integration: `test/equipment-reservations.e2e-spec.ts::creates nothing when rejected` |

### TC-S2-129

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-129 |
| Story/AC ref | Story 31 Not in the ACs |
| Test Scenario | The Coordinator is notified when equipment is committed to their event |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-122-setup.sql + tc-s2-129-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Commit 2 microphones to Capstone.<br>2. Commit the projector (refused).<br>3. Commit to the event with no Coordinator. |
| Test Data | tc-s2-122; tc-s2-129 (unassigned event) |
| Expected Result | Cody Coordinator gets one unread notification naming "2 × Wireless microphone" and Capstone Showcase. A refusal notifies nobody. The unassigned event's commitment is saved with nobody notified. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | This behaviour is not in Story 31's ACs; it is tested because the code does it. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-reservations.e2e-spec.ts::records a notification for the assigned Coordinator`<br>Integration: `test/equipment-reservations.e2e-spec.ts::notifies nobody when the commitment is rejected`<br>Integration: `test/equipment-reservations.e2e-spec.ts::still commits, notifying nobody, when the event has no Coordinator` |

---

## Story 32: Release equipment reservations for a cancelled event (Technical Support Staff)

### TC-S2-130

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-130 |
| Story/AC ref | Story 32 AC-1 |
| Test Scenario | Cancelling an event releases all of its reservations |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-122-setup.sql + tc-s2-130-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Commit microphones and PA systems to Capstone, then cancel it.<br>2. (Reset with tc-s2-130) Cancel Capstone. |
| Test Data | tc-s2-122; tc-s2-130 (one pending, one rejected reservation) |
| Expected Result | Every held or pending reservation becomes Released, with a release time; the event is Cancelled. The rejected reservation is left alone. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | Code gap: no endpoint or screen cancels an event, so the test cancels through EventsService.setStatus(), the method any future cancel action must use (see TC-S2-135). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-reservations.e2e-spec.ts::marks every reservation the event held as RELEASED, with a timestamp`<br>Integration: `test/equipment-reservations.e2e-spec.ts::releases a still-pending reservation too, leaving a rejected one alone` |

### TC-S2-131

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-131 |
| Story/AC ref | Story 32 AC-1 |
| Test Scenario | Only cancelling releases reservations |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-122-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Commit microphones to Capstone, then move it to Confirmed. |
| Test Data | tc-s2-122 |
| Expected Result | The reservation stays held. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-reservations.e2e-spec.ts::releases nothing when the event moves to any other status` |

### TC-S2-132

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-132 |
| Story/AC ref | Story 32 AC-2 |
| Test Scenario | Released equipment counts as available again for the same period |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-122-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Commit all 10 microphones to Capstone and check availability.<br>2. Cancel Capstone and check again.<br>3. Commit 10 to the overlapping Industry Night. |
| Test Data | tc-s2-122 |
| Expected Result | Before: 0 available. After cancelling: 10 available, none reserved, and the 10 can be committed to Industry Night (refused before the cancellation). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-reservations.e2e-spec.ts::restores the units in the availability check for the same window`<br>Integration: `test/equipment-reservations.e2e-spec.ts::lets the released units be committed to an overlapping event` |

### TC-S2-133

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-133 |
| Story/AC ref | Story 32 AC-3 |
| Test Scenario | Technical Support can see which reservations were released, for which cancelled event |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-122-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech); other roles. |
| Test Steps | 1. Commit to Capstone and Industry Night, cancel Capstone, open Released reservations.<br>2. (Reset) Open it with nothing released.<br>3. Open it as other roles. |
| Test Data | tc-s2-122 |
| Expected Result | Only Capstone's reservation is listed, with the equipment, quantity, times, release time and the event (Cancelled). Empty when nothing is released. Other roles are refused (403). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-reservations.e2e-spec.ts::lists released reservations with the equipment and the cancelled event`<br>Integration: `test/equipment-reservations.e2e-spec.ts::is empty when nothing has been released`<br>Integration: `test/equipment-reservations.e2e-spec.ts::refuses %s (403)` |

### TC-S2-134

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-134 |
| Story/AC ref | Story 32 AC-4 |
| Test Scenario | Release affects only that event's reservations, and never releases twice |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-122-setup.sql + tc-s2-134-setup.sql on testDB (reset before test). Logged in as tech.support@example.com (Toby Tech). |
| Test Steps | 1. Commit to Capstone and Alumni Day, cancel Capstone.<br>2. (Reset with tc-s2-134) Cancel Capstone.<br>3. Release Capstone a second time. |
| Test Data | tc-s2-122; tc-s2-134 (a reservation released on 1 Jan 2030) |
| Expected Result | Alumni Day's reservation stays held. The earlier release keeps its 1 Jan 2030 time. The second release changes nothing. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/equipment-reservations.e2e-spec.ts::leaves other events' reservations of the same item held`<br>Integration: `test/equipment-reservations.e2e-spec.ts::does not re-release an already-released reservation`<br>Integration: `test/equipment-reservations.e2e-spec.ts::changes nothing on a second release of the same cancelled event` |

### TC-S2-135

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-135 |
| Story/AC ref | Story 32 AC-1 |
| Test Scenario | A user cancels an event through the app, and its equipment reservations are released |
| Pre-conditions | Not applicable: the behaviour this AC describes does not exist yet. |
| Test Steps | 1. — |
| Test Data | — |
| Expected Result | Cancelling an event (by whoever may cancel it) changes its status to Cancelled and releases its reservations. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | No endpoint or screen cancels an event, so this cannot happen through the app. The release itself works when the status changes (TC-S2-130). |
| Status | Fail |
| Remarks | Code gap: add a cancel action that goes through EventsService.setStatus(); the release then follows automatically. |
| Executed By |  |
| Date of Execution |  |
| Automated by | None (nothing to automate yet) |

---

## Story 33: Register for an event and provide required information (Attendee)

### TC-S2-136

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-136 |
| Story/AC ref | Story 33 AC-1 |
| Test Scenario | The Register option is offered for a confirmed event with registration enabled |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-136-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Check the registration options for "Spring Gala". |
| Test Data | tc-s2-136: CONFIRMED, registration enabled, open 1 Jan 2026 - 28 Sep 2030, capacity 100 |
| Expected Result | Registration is possible, with the open and close times and the capacity shown. Not cached. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-register.e2e-spec.ts::offers it for a confirmed event with registration enabled` |

### TC-S2-137

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-137 |
| Story/AC ref | Story 33 AC-1 |
| Test Scenario | The Register option is withheld unless the event is confirmed with registration enabled |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-136-setup.sql + tc-s2-137-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Check options for, and try to register for, the event with registration off and the event still in planning.<br>2. Do the same for the draft event. |
| Test Data | tc-s2-137 |
| Expected Result | Off and planning: not offered, and registering is refused (409) "Registration is not available for this event."; nothing saved. Draft: not found (404). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-register.e2e-spec.ts::withholds it for an event %s, and refuses to register (409)`<br>Integration: `test/registrations-register.e2e-spec.ts::treats a draft event as not found (404)` |

### TC-S2-138

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-138 |
| Story/AC ref | Story 33 AC-2 |
| Test Scenario | Missing or invalid fields are flagged and block submission |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-136-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Register with no phone, a phone of spaces, and "call me".<br>2. Register with no event.<br>3. Register with only the phone "  91234567  ". |
| Test Data | tc-s2-136 |
| Expected Result | Each missing or invalid field is refused (400) with a message naming it; nothing is saved. The phone alone is accepted and stored as "91234567". |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-register.e2e-spec.ts::flags %s (400) and saves nothing`<br>Integration: `test/registrations-register.e2e-spec.ts::flags a missing event (400)`<br>Integration: `test/registrations-register.e2e-spec.ts::accepts a phone alone, stored without surrounding spaces` |

### TC-S2-139

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-139 |
| Story/AC ref | Story 33 AC-3 |
| Test Scenario | A successful registration is saved as Registered, with a confirmation |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-136-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Register for Spring Gala with phone, dietary and accessibility details. |
| Test Data | tc-s2-136 |
| Expected Result | Created (201) as Registered with the details; one row saved for Ann; a confirmation notification "You are registered for "Spring Gala"." |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | The confirmation shown on screen is covered by TC-S2-144 (manual). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-register.e2e-spec.ts::saves the registration as REGISTERED and confirms it` |

### TC-S2-140

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-140 |
| Story/AC ref | Story 33 AC-4, AC-5 |
| Test Scenario | One active registration per event, and no second attempt once confirmed |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-136-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Register for Spring Gala, then again.<br>2. Check the options.<br>3. (Reset) Submit the form twice at the same moment. |
| Test Data | tc-s2-136 |
| Expected Result | The second attempt is refused (409) "You are already registered for this event."; the options no longer offer Register. Only one registration exists, also after the double submission. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-register.e2e-spec.ts::refuses a second registration and withdraws the Register option`<br>Integration: `test/registrations-register.e2e-spec.ts::lets only one of two simultaneous submissions through` |

### TC-S2-141

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-141 |
| Story/AC ref | Story 33 AC-6 |
| Test Scenario | Registration is only possible between the open and close times, which are shown otherwise |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-136-setup.sql + tc-s2-137-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Check options for and register for "Opens later" and "Already closed". |
| Test Data | tc-s2-137 |
| Expected Result | Both refused (409). Not yet open: "Registration opens at 2030-01-01… and closes at 2030-09-28…". Closed: "Registration is closed. It opened at 2019-01-01… and closed at 2020-01-01…". |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-register.e2e-spec.ts::refuses before it opens, showing the open and close times`<br>Integration: `test/registrations-register.e2e-spec.ts::refuses after it closes, showing the open and close times` |

### TC-S2-142

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-142 |
| Story/AC ref | Story 33 AC-7 |
| Test Scenario | A full event rejects the registration with a "full" message |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-136-setup.sql + tc-s2-142-setup.sql on testDB (reset before test). Logged in as attendee@example.com; attendee.c@example.com. |
| Test Steps | 1. Register for "Sold Out Talk".<br>2. Ann and Cal register for "Last Place Talk" at the same moment. |
| Test Data | tc-s2-142: Sold Out Talk 2 of 2 taken; Last Place Talk 1 of 2 taken |
| Expected Result | Sold Out: refused (409) "This event is full.". Last place: exactly one succeeds; the other is told the event is full. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-register.e2e-spec.ts::refuses with "This event is full."`<br>Integration: `test/registrations-register.e2e-spec.ts::gives the last place to exactly one of two simultaneous Attendees` |

### TC-S2-143

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-143 |
| Story/AC ref | Story 33 Access |
| Test Scenario | Only Attendees can register |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-136-setup.sql on testDB (reset before test). Logged in as organiser@example.com; coord.a@example.com; tech.support@example.com; venue.staff@example.com. |
| Test Steps | 1. Register and check options as each of those roles, and without logging in. |
| Test Data | tc-s2-136 |
| Expected Result | Other roles are refused (403) and nothing is saved; no login is refused (401). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-register.e2e-spec.ts::refuses %s (403)`<br>Integration: `test/registrations-register.e2e-spec.ts::refuses a request without a token (401)` |

### TC-S2-144

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-144 |
| Story/AC ref | Story 33 AC-1, AC-2, AC-3, AC-6, AC-7 |
| Test Scenario | Register for an event from the Attendee screens |
| Pre-conditions | Log in as attendee@example.com. A confirmed event open for registration; one not yet open; one full. |
| Test Steps | 1. Open Browse events.<br>2. Open the open event, click Register, submit with the phone empty, then with a valid phone.<br>3. Open the not-yet-open and the full events. |
| Test Data | Seed data on the running app |
| Expected Result | Register shows only where registration applies. The empty phone is flagged and blocks submission; the valid form shows a confirmation and the event appears under My registrations. The not-yet-open event shows its open and close times instead of Register; the full one says it is full. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result |  |
| Status | Not Executed |
| Remarks | Manual: the AC is about the user interface. |
| Executed By |  |
| Date of Execution |  |
| Automated by | Manual |

---

## Story 34: View my registration status (Attendee)

### TC-S2-145

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-145 |
| Story/AC ref | Story 34 AC-1 |
| Test Scenario | "My Registrations" lists each registration with event name, date/time, venue and status |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-142-setup.sql + tc-s2-145-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Open My registrations. |
| Test Data | tc-s2-145: Autumn Concert (Main Hall, registered), Pottery Workshop (no venue, withdrawn 10 Sep 2026) |
| Expected Result | Both are listed, soonest event first: Pottery Workshop 15 Sep 2030 09:00-12:00, no venue, Withdrawn; Autumn Concert 1 Oct 2030 18:00-21:00, Main Hall, Registered. Not cached. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-status.e2e-spec.ts::lists both registrations with their details and status` |

### TC-S2-146

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-146 |
| Story/AC ref | Story 34 AC-2 |
| Test Scenario | Event details shown are always the current ones |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-142-setup.sql + tc-s2-145-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Rename and move the Autumn Concert, then open My registrations.<br>2. Approve a Seminar Room booking for the Pottery Workshop, then open that registration. |
| Test Data | tc-s2-145 |
| Expected Result | The concert shows its new name and 2 Oct times. The workshop shows Seminar Room as its venue. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-status.e2e-spec.ts::shows a renamed, retimed event as it is now`<br>Integration: `test/registrations-status.e2e-spec.ts::shows a venue once its booking is approved` |

### TC-S2-147

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-147 |
| Story/AC ref | Story 34 AC-3 |
| Test Scenario | "No Events Registered" is shown when I have no registrations |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-142-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Open My registrations with no registrations. |
| Test Data | base users only (other Attendees have registrations) |
| Expected Result | An empty list with the message "No Events Registered". |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-status.e2e-spec.ts::says "No Events Registered"` |

### TC-S2-148

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-148 |
| Story/AC ref | Story 34 AC-4 |
| Test Scenario | I can only view my own registrations; another Attendee's is denied |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-142-setup.sql + tc-s2-145-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Open My registrations.<br>2. Open Bea's registration by its id.<br>3. Open my own registration; open an unknown id. |
| Test Data | tc-s2-142 (Bea's registration REG-003); tc-s2-145 |
| Expected Result | My list holds only my two registrations. Bea's is denied (403) "you can only view your own registrations". My own opens; the unknown id is not found (404). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-status.e2e-spec.ts::never lists another Attendee's registrations`<br>Integration: `test/registrations-status.e2e-spec.ts::denies opening another Attendee's registration (403)`<br>Integration: `test/registrations-status.e2e-spec.ts::opens my own registration`<br>Integration: `test/registrations-status.e2e-spec.ts::reports an unknown registration as not found (404)` |

### TC-S2-149

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-149 |
| Story/AC ref | Story 34 Access |
| Test Scenario | Only Attendees can use My registrations |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-142-setup.sql on testDB (reset before test). Logged in as organiser@example.com; coord.a@example.com; tech.support@example.com; venue.staff@example.com. |
| Test Steps | 1. Open My registrations and a registration as each role, and without logging in. |
| Test Data | tc-s2-142 |
| Expected Result | Other roles are refused (403); no login is refused (401). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-status.e2e-spec.ts::refuses %s (403)`<br>Integration: `test/registrations-status.e2e-spec.ts::refuses a request without a token (401)` |

### TC-S2-150

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-150 |
| Story/AC ref | Story 34 AC-1, AC-3 |
| Test Scenario | See My registrations on the screen |
| Pre-conditions | Log in as attendee@example.com on the running app, once with no registrations and once with an active and a withdrawn one. |
| Test Steps | 1. Open My registrations. |
| Test Data | Seed data on the running app |
| Expected Result | With none: "No Events Registered". Otherwise each registration shows the event name, date/time, venue and a Registered or Withdrawn status. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result |  |
| Status | Not Executed |
| Remarks | Manual: the AC is about the user interface. |
| Executed By |  |
| Date of Execution |  |
| Automated by | Manual |

---

## Story 35: Withdraw my registration (Attendee)

### TC-S2-151

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-151 |
| Story/AC ref | Story 35 AC-1 |
| Test Scenario | The withdraw option is available on active registrations before the cutoff |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-142-setup.sql + tc-s2-151-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Open the Charity Dinner registration.<br>2. Open My registrations. |
| Test Data | tc-s2-151: Charity Dinner (cutoff 30 Sep 2030), Late Lecture (cutoff passed), Film Night (withdrawn) |
| Expected Result | Charity Dinner can be withdrawn, showing the cutoff 30 Sep 2030. In the list only Charity Dinner can be withdrawn. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-withdraw.e2e-spec.ts::offers withdrawal, showing the cutoff`<br>Integration: `test/registrations-withdraw.e2e-spec.ts::marks which registrations in "My Registrations" can be withdrawn` |

### TC-S2-152

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-152 |
| Story/AC ref | Story 35 AC-2 |
| Test Scenario | Withdrawal requires confirmation; cancelling leaves the registration unchanged |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-142-setup.sql + tc-s2-151-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Withdraw Charity Dinner with no confirmation (prompt cancelled), with confirm false, and with confirm "yes". |
| Test Data | tc-s2-151 |
| Expected Result | Each is refused (400) "withdrawal must be confirmed (confirm: true)"; the registration stays Registered. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | The prompt itself is on screen: TC-S2-158 (manual). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-withdraw.e2e-spec.ts::refuses %s (400) and leaves the registration as it was` |

### TC-S2-153

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-153 |
| Story/AC ref | Story 35 AC-3 |
| Test Scenario | On confirmation, the status changes to Withdrawn |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-142-setup.sql + tc-s2-151-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Withdraw Charity Dinner, confirmed.<br>2. (Reset) Withdraw it twice at the same moment. |
| Test Data | tc-s2-151 |
| Expected Result | It becomes Withdrawn with the time recorded, and a notification says the registration was withdrawn. Of two simultaneous withdrawals, one succeeds and one is refused (409). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-withdraw.e2e-spec.ts::changes the status to WITHDRAWN and records when`<br>Integration: `test/registrations-withdraw.e2e-spec.ts::lets only one of two simultaneous withdrawals through` |

### TC-S2-154

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-154 |
| Story/AC ref | Story 35 AC-4 |
| Test Scenario | After a withdrawal, the registration count drops by one and the place is free for others |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-142-setup.sql + tc-s2-151-setup.sql on testDB (reset before test). Logged in as attendee.b@example.com; attendee@example.com. |
| Test Steps | 1. Check Sold Out Talk's options (full).<br>2. As Bea, withdraw from it.<br>3. Check again, and register as Ann. |
| Test Data | tc-s2-142: Sold Out Talk, 2 of 2 taken |
| Expected Result | Before: 2 registered, full. After Bea withdraws: 1 registered and registration is open; Ann registers (201). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-withdraw.e2e-spec.ts::frees the place at a full event for another Attendee` |

### TC-S2-155

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-155 |
| Story/AC ref | Story 35 AC-5 |
| Test Scenario | After the cutoff, withdrawal is unavailable and the cutoff is shown |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-142-setup.sql + tc-s2-151-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Open the Late Lecture registration.<br>2. Try to withdraw it. |
| Test Data | tc-s2-151 (cutoff 1 Jan 2020) |
| Expected Result | Withdrawal is unavailable: "The withdrawal cutoff of 2020-01-01T00:00:00.000Z has passed.", with the cutoff shown. Withdrawing is refused (409) with the same reason; still Registered. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-withdraw.e2e-spec.ts::withholds the option and shows the cutoff`<br>Integration: `test/registrations-withdraw.e2e-spec.ts::refuses a withdrawal after the cutoff (409)` |

### TC-S2-156

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-156 |
| Story/AC ref | Story 35 AC-6 |
| Test Scenario | Withdrawn registrations show no withdraw option; re-registering follows Story 33 |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-142-setup.sql + tc-s2-151-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee). |
| Test Steps | 1. Open the Film Night registration (withdrawn); try to withdraw it.<br>2. Register for Film Night again. |
| Test Data | tc-s2-151 |
| Expected Result | No withdraw option ("This registration has already been withdrawn."); withdrawing is refused (409). Registering again succeeds and re-activates the same registration (Registered, new phone, no withdrawal time). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | The story says re-registering follows "#34"; in the user-story document registering is Story 33. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-withdraw.e2e-spec.ts::offers no withdraw option, and refuses withdrawing again (409)`<br>Integration: `test/registrations-withdraw.e2e-spec.ts::lets the Attendee register again, re-activating the same registration` |

### TC-S2-157

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-157 |
| Story/AC ref | Story 35 Access |
| Test Scenario | Only my own registration can be withdrawn, by Attendees only |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-142-setup.sql + tc-s2-151-setup.sql on testDB (reset before test). Logged in as attendee@example.com (Ann Attendee); other roles. |
| Test Steps | 1. As Ann, withdraw Bea's registration.<br>2. Withdraw as each other role, and without logging in. |
| Test Data | tc-s2-142; tc-s2-151 |
| Expected Result | Bea's is refused (403) and stays Registered. Other roles are refused (403); no login is refused (401). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/registrations-withdraw.e2e-spec.ts::refuses to withdraw another Attendee's registration (403)`<br>Integration: `test/registrations-withdraw.e2e-spec.ts::refuses %s (403)`<br>Integration: `test/registrations-withdraw.e2e-spec.ts::refuses a request without a token (401)` |

### TC-S2-158

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-158 |
| Story/AC ref | Story 35 AC-1, AC-2, AC-5, AC-6 |
| Test Scenario | Withdraw from the screen, with a confirmation prompt |
| Pre-conditions | Log in as attendee@example.com. One registration before its cutoff, one after, one withdrawn. |
| Test Steps | 1. Open My registrations.<br>2. Click Withdraw on the first, then Cancel in the prompt.<br>3. Click Withdraw again and confirm.<br>4. Look at the other two. |
| Test Data | Seed data on the running app |
| Expected Result | Cancelling leaves it Registered. Confirming changes it to Withdrawn. The past-cutoff registration shows its cutoff instead of Withdraw; the withdrawn one has no Withdraw option. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result |  |
| Status | Not Executed |
| Remarks | Manual: the AC is about the user interface. |
| Executed By |  |
| Date of Execution |  |
| Automated by | Manual |

---

## Story 36: Request an event change (Event Organiser)

### TC-S2-159

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-159 |
| Story/AC ref | Story 36 AC-1, AC-6 |
| Test Scenario | The form shows the current date, time, attendance and equipment, and offers the catalogue |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-159-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Open "Tech Talk".<br>2. Open the equipment catalogue picker. |
| Test Data | tc-s2-159: Tech Talk 1 Oct 2030 09:00-17:00, 120 expected, 2 × Projector (catalogue), 1 × Banner stand (free text) |
| Expected Result | The event shows its dates, 120 expected and both equipment lines, with no pending request. The picker lists Projection screen, Projector and Wireless microphone (id, type, description, location only). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-request.e2e-spec.ts::shows the event's current values`<br>Integration: `test/events-change-request.e2e-spec.ts::offers the equipment catalogue to pick from` |

### TC-S2-160

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-160 |
| Story/AC ref | Story 36 AC-1 |
| Test Scenario | A reason is required |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-159-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Request attendance 150 with no reason, an empty reason, and a reason of spaces. |
| Test Data | tc-s2-159 |
| Expected Result | Each is refused (400) "reason is required"; nothing is saved. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-request.e2e-spec.ts::refuses %s (400) and saves nothing` |

### TC-S2-161

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-161 |
| Story/AC ref | Story 36 AC-2 |
| Test Scenario | At least one field must differ from the current value |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-159-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Request with nothing proposed; with attendance 120; with the same dates; with the same equipment. |
| Test Data | tc-s2-159 |
| Expected Result | Each is refused (400) "at least one field must differ from the event’s current value"; nothing is saved. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-request.e2e-spec.ts::refuses %s (400)` |

### TC-S2-162

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-162 |
| Story/AC ref | Story 36 AC-3 |
| Test Scenario | Proposed dates cannot be in the past, and the end must be after the start |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-159-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Request a start in 2020; an end in 2020; an end before the proposed start; an end before the current start; a start after the current end; "next Tuesday".<br>2. Request 2 Oct 2030 10:00-18:00. |
| Test Data | tc-s2-159 |
| Expected Result | Each invalid date is refused (400) naming the problem; nothing is saved. The valid new date is accepted (201). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-request.e2e-spec.ts::refuses %s (400)`<br>Integration: `test/events-change-request.e2e-spec.ts::accepts a new date and time in the future` |

### TC-S2-163

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-163 |
| Story/AC ref | Story 36 AC-4 |
| Test Scenario | Expected attendance must be a positive whole number |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-159-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Request attendance 0, -5, 2.5 and "lots". |
| Test Data | tc-s2-159 |
| Expected Result | Each is refused (400); nothing is saved. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-request.e2e-spec.ts::refuses %p (400)` |

### TC-S2-164

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-164 |
| Story/AC ref | Story 36 AC-5 |
| Test Scenario | Equipment changes can add items, remove items and change quantities |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-159-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Request 3 × Projector and 4 × Wireless microphone.<br>2. (Reset) Request an empty equipment list. |
| Test Data | tc-s2-159 |
| Expected Result | Both are saved: the first with the new list (quantity changed, item added), the second as "remove everything". |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-request.e2e-spec.ts::saves a new list that changes a quantity and adds an item`<br>Integration: `test/events-change-request.e2e-spec.ts::saves a request to remove every item` |

### TC-S2-165

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-165 |
| Story/AC ref | Story 36 AC-6 |
| Test Scenario | Equipment items are selected from the catalogue |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-159-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Request an item that is not in the catalogue.<br>2. Request the same item twice. |
| Test Data | tc-s2-159 |
| Expected Result | Refused (400) "equipment item q-s2-cr-hoverboard is not in the catalogue"; the duplicate is refused with a message to combine the quantities. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-request.e2e-spec.ts::refuses an item that is not in the catalogue (400)`<br>Integration: `test/events-change-request.e2e-spec.ts::refuses the same item twice (400)` |

### TC-S2-166

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-166 |
| Story/AC ref | Story 36 AC-7 |
| Test Scenario | Equipment quantities must be positive whole numbers |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-159-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Request a microphone quantity of 0, -1 and 1.5. |
| Test Data | tc-s2-159 |
| Expected Result | Each is refused (400); nothing is saved. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-request.e2e-spec.ts::refuses a quantity of %p (400)` |

### TC-S2-167

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-167 |
| Story/AC ref | Story 36 AC-8 |
| Test Scenario | A submitted request is saved as Pending and linked to the event |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-159-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Request attendance 150 (with the start unchanged).<br>2. Request again while it is pending.<br>3. (Reset) Send two requests at the same moment. |
| Test Data | tc-s2-159 |
| Expected Result | Saved as Pending on Tech Talk, by Olivia, with the reason and only the changed attendance (start stored as unchanged). A second request is refused (409) until the first is decided; of two simultaneous requests only one is saved. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-request.e2e-spec.ts::saves it as PENDING on the event, storing only what changes`<br>Integration: `test/events-change-request.e2e-spec.ts::refuses a second request while one is pending (409)`<br>Integration: `test/events-change-request.e2e-spec.ts::lets only one of two simultaneous requests through` |

### TC-S2-168

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-168 |
| Story/AC ref | Story 36 AC-9 |
| Test Scenario | The original details still show, with the pending request alongside |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-159-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Request attendance 150 and a move to 2 Oct.<br>2. Open the event. |
| Test Data | tc-s2-159 |
| Expected Result | The event still shows 120 expected and 1 Oct; the pending request (150, 2 Oct, its reason) is shown beside it. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-request.e2e-spec.ts::keeps the event as it was and shows the request beside it` |

### TC-S2-169

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-169 |
| Story/AC ref | Story 36 AC-10 |
| Test Scenario | Change requests are only for submitted or confirmed events |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-159-setup.sql + tc-s2-169-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Request a change to the confirmed, draft, cancelled, completed and rejected events. |
| Test Data | tc-s2-169 |
| Expected Result | Confirmed: accepted (201). Each other: refused (409) "event is <STATUS>; change requests are only available for submitted or confirmed events". |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | Every status from Submitted to Confirmed (including Returned and Planning) is allowed, on the team's reading of "submitted or confirmed". |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-request.e2e-spec.ts::accepts a request for a confirmed event`<br>Integration: `test/events-change-request.e2e-spec.ts::refuses a %s event (409)` |

### TC-S2-170

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-170 |
| Story/AC ref | Story 36 AC-11 |
| Test Scenario | Organisers can only request changes to their own events |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-159-setup.sql + tc-s2-170-setup.sql on testDB (reset before test). Logged in as other.organiser@example.com (Oscar Organiser); coord.a@example.com; attendee@example.com. |
| Test Steps | 1. As Oscar, request a change to Tech Talk, then to his own event.<br>2. Request as a Coordinator and an Attendee. |
| Test Data | tc-s2-170: Oscar and his submitted event |
| Expected Result | Tech Talk is not found for Oscar (404), nothing saved; his own event is accepted (201). Other roles are refused (403). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-request.e2e-spec.ts::hides another Organiser's event (404)`<br>Integration: `test/events-change-request.e2e-spec.ts::accepts the Organiser\`<br>Integration: `test/events-change-request.e2e-spec.ts::refuses %s (403)` |

### TC-S2-171

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-171 |
| Story/AC ref | Story 36 AC-1, AC-5, AC-9 |
| Test Scenario | Request a change from the Organiser's event page |
| Pre-conditions | Log in as organiser@example.com. A submitted event with some catalogue equipment. |
| Test Steps | 1. Open the event and start a change request.<br>2. Change the attendance and one equipment quantity, add an item from the catalogue, enter a reason, submit.<br>3. Look at the event page. |
| Test Data | Seed data on the running app |
| Expected Result | The form starts from the current date, time, attendance and equipment; items are picked from the catalogue. After submitting, the original details still show, with the pending request beside them. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result |  |
| Status | Not Executed |
| Remarks | Manual: the AC is about the user interface. |
| Executed By |  |
| Date of Execution |  |
| Automated by | Manual |

---

## Story 37: Review change requests (Event Coordinator)

### TC-S2-172

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-172 |
| Story/AC ref | Story 37 AC-1 |
| Test Scenario | Pending change requests on my own events are listed, oldest first |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-159-setup.sql + tc-s2-172-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator); coord.b@example.com. |
| Test Steps | 1. Open Change requests as Cody, then as Casey. |
| Test Data | tc-s2-172: Cody has two pending (8 and 10 Sep 2026) and one decided; Casey has one pending |
| Expected Result | Cody sees "Clashes with exams" (Open House) then "More sign-ups than expected", each with the event and requester, and not the decided one or Casey's. Casey sees only hers. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-review.e2e-spec.ts::lists only my pending requests, oldest first`<br>Integration: `test/events-change-review.e2e-spec.ts::shows another Coordinator only theirs` |

### TC-S2-173

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-173 |
| Story/AC ref | Story 37 AC-2 |
| Test Scenario | A request shows the event as it is now beside what is proposed, with the reason |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-159-setup.sql + tc-s2-172-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator). |
| Test Steps | 1. Open the attendance request.<br>2. Open the date request. |
| Test Data | tc-s2-172 |
| Expected Result | Attendance: proposed 350 beside the current 120, dates and equipment, the reason and Olivia as requester. Dates: the new window 2 Oct 2030 09:00-17:00. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-review.e2e-spec.ts::shows current and proposed values, the reason and the requester`<br>Integration: `test/events-change-review.e2e-spec.ts::shows the new window a date change would give the event` |

### TC-S2-174

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-174 |
| Story/AC ref | Story 37 AC-6 |
| Test Scenario | A warning shows when the proposed attendance exceeds a booked venue |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-159-setup.sql + tc-s2-172-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator). |
| Test Steps | 1. Open the attendance request.<br>2. Open the date request. |
| Test Data | tc-s2-172: Tech Talk booked in Main Hall (capacity 300) |
| Expected Result | Attendance: "The proposed attendance of 350 exceeds the capacity of Main Hall (300)." Dates: no capacity warning. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-review.e2e-spec.ts::warns that 350 exceeds Main Hall (300)`<br>Integration: `test/events-change-review.e2e-spec.ts::raises no capacity warning when attendance is not changing` |

### TC-S2-175

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-175 |
| Story/AC ref | Story 37 AC-3, AC-5 |
| Test Scenario | Rejecting needs a reason |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-159-setup.sql + tc-s2-172-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator). |
| Test Steps | 1. Reject the attendance request with no reason, and with spaces.<br>2. Reject it with "Main Hall cannot hold 350". |
| Test Data | tc-s2-172 |
| Expected Result | Without a real reason: refused (400), still Pending. With one: Rejected by Cody with the reason; the event still expects 120. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-review.e2e-spec.ts::refuses a rejection with %s (400)`<br>Integration: `test/events-change-review.e2e-spec.ts::rejects with the reason, leaving the event unchanged` |

### TC-S2-176

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-176 |
| Story/AC ref | Story 37 AC-5 |
| Test Scenario | The Organiser sees the decision and its reason |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-159-setup.sql + tc-s2-172-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. As Cody, reject the attendance request with a reason.<br>2. As Olivia, open Tech Talk. |
| Test Data | tc-s2-172 |
| Expected Result | No pending request; the latest decision shows Rejected with "Main Hall cannot hold 350". |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-review.e2e-spec.ts::shows the rejection and reason on the Organiser\` |

### TC-S2-177

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-177 |
| Story/AC ref | Story 37 AC-4 |
| Test Scenario | Approving applies the change and records it in the event's history |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-159-setup.sql + tc-s2-172-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator). |
| Test Steps | 1. Approve the attendance request.<br>2. Approve the date request. |
| Test Data | tc-s2-172 |
| Expected Result | Attendance becomes 350; the request is Approved by Cody; the history entry (what: 120 → 350, who: Cody, when: its time) is flagged for review because Main Hall was confirmed. The Open House moves to 2 Oct 09:00-17:00. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-review.e2e-spec.ts::applies a new attendance and records it in the history`<br>Integration: `test/events-change-review.e2e-spec.ts::applies new dates` |

### TC-S2-178

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-178 |
| Story/AC ref | Story 37 AC-4 |
| Test Scenario | Approving an equipment change replaces the catalogue lines, keeping notes and free-text lines |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-159-setup.sql + tc-s2-172-setup.sql + tc-s2-178-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator). |
| Test Steps | 1. Approve the Robotics Expo equipment request. |
| Test Data | tc-s2-178: 2 × Projector ("HDMI") and 1 × Banner stand; request 3 × Projector, 4 × Wireless microphone |
| Expected Result | The event now has 3 × Projector (still "HDMI"), 4 × Wireless microphone and 1 × Banner stand. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-review.e2e-spec.ts::replaces the catalogue equipment, keeping notes and free-text lines` |

### TC-S2-179

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-179 |
| Story/AC ref | Story 37 AC-3, AC-4 |
| Test Scenario | A request is decided only once |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-159-setup.sql + tc-s2-172-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator). |
| Test Steps | 1. Reject the attendance request, then approve it.<br>2. (Reset) Approve and reject it at the same moment. |
| Test Data | tc-s2-172 |
| Expected Result | The second decision is refused (409) "this change request has already been decided" and the event is unchanged. Of the simultaneous pair, exactly one succeeds and the event matches it. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-review.e2e-spec.ts::refuses a second decision (409)`<br>Integration: `test/events-change-review.e2e-spec.ts::lets only one of a simultaneous approve and reject through` |

### TC-S2-180

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-180 |
| Story/AC ref | Story 37 Access |
| Test Scenario | Only the event's assigned Coordinator can review its requests |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-159-setup.sql + tc-s2-172-setup.sql on testDB (reset before test). Logged in as coord.b@example.com; organiser@example.com; attendee@example.com. |
| Test Steps | 1. As Casey, open, approve and reject Cody's request.<br>2. Open an unknown request.<br>3. Use the routes as the Organiser and an Attendee. |
| Test Data | tc-s2-172 |
| Expected Result | Casey gets not found (404) each time and the request stays Pending. The unknown request is not found (404). Other roles are refused (403). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | Integration: `test/events-change-review.e2e-spec.ts::hides another Coordinator's request (404)`<br>Integration: `test/events-change-review.e2e-spec.ts::reports an unknown request as not found (404)`<br>Integration: `test/events-change-review.e2e-spec.ts::refuses %s (403)` |

### TC-S2-181

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-181 |
| Story/AC ref | Story 37 AC-1, AC-2, AC-6 |
| Test Scenario | Review a change request on the Coordinator screens |
| Pre-conditions | Log in as coord.a@example.com. A pending request that proposes more attendees than the booked venue holds. |
| Test Steps | 1. Open Change requests.<br>2. Open the request.<br>3. Reject it without a reason, then with one. |
| Test Data | Seed data on the running app |
| Expected Result | The list shows the pending request; the review shows current and proposed values side by side, the reason and a capacity warning. Reject needs a reason before it can be submitted. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result |  |
| Status | Not Executed |
| Remarks | Manual: the AC is about the user interface. |
| Executed By |  |
| Date of Execution |  |
| Automated by | Manual |

---

## Changes since 18 Oct

| Date | Change | Commit | Test cases affected |
|---|---|---|---|
| 2026-10-26 | **Regeneration, batch 2 (Story 20 to 23).** Every test commented with its test case, story/AC and a `Code:` line. The Story 20 AC-2 tests, which edited rows in the test and had no test case, now load `tc-s2-35-setup.sql`. Booking UI tests relabelled from app-code story numbers to the document's. New UI tests (`booking-request-form.test.tsx`, `venue-booking-queue.test.tsx`, decisions on the detail view) and browser tests (`e2e/us20-us23-bookings.spec.ts`). | this commit | TC-S2-49: Fail → Pass (fixed). TC-S2-66: N/A → Pass. TC-S2-67: Fail → Pass. TC-S2-81, 82: Not Executed → Pass. New: TC-S2-187. All Story 20 to 23 cases re-run. |
| 2026-10-26 | **Regeneration, batch 1 (Story 16 to 19).** Every test commented with its test case, story/AC and a `Code:` line. The blocked-period and suitability AC-3 tests, which inserted rows in the test and had no test case, now load setup scripts (`tc-s2-182-setup.sql`, `tc-s2-30-setup.sql`); `tc-s2-10-setup.sql` dates a booking relative to today for the browser tests. New UI tests (`venue-calendar.test.tsx`, `coordinator-venues.test.tsx`, more in the availability calendar and suitability panel) and browser tests (`e2e/us16-us19-venues.spec.ts`). **Code change:** "Request this venue" opens the event's booking form with the venue chosen (US-19 AC-5). | `6eb73ea` | TC-S2-10, 11, 17: Not Executed → Pass. TC-S2-30: Fail → Pass. New: TC-S2-182 to 186. All Story 16 to 19 cases re-run. |

---

## Gaps (no automated test yet)

| Test case | Story/AC | What's missing |
|---|---|---|
| Story 24 to 37 | all | Re-checked in later batches of the regeneration |
