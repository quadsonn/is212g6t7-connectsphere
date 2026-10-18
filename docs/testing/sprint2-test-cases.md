# Sprint 2 test cases

Written test cases for the Sprint 2 user stories, traced from story → acceptance criterion → test case → automated test. Story numbers follow the user-story document, and so do the `US-XX` labels in every test file. App code comments and migration folder names still use older labels (see [sprint2-conventions.md](sprint2-conventions.md)).

## How to read this file

- Each test case is one table in the course template. The top part is the test case specification; the bottom part is the test execution record.
- **Pre-conditions** name the exact SQL setup script(s). The automated test loads the same scripts, which is the traceability link. Scripts are in `test/fixtures/sql/` and listed in its [README](../../test/fixtures/sql/README.md). All users share the password `correct-horse-battery-staple`.
- Where a test case has several tests, Pre-conditions list every script any of them loads; a few validation and access tests need only `base-users.sql`.
- **Expected Result** is written from the AC wording, not from the code. Code gaps are noted in Remarks.
- **Automated by** gives `<file>::<exact test name>`. Names with `%s` are table-driven (`it.each`), and every row runs.
- **Manual** test cases cover what only the user interface can show. Run them on the app, fill in the execution record, and change the Status.

**Legend**

| Value | Meaning |
|---|---|
| Status **Pass** | The automated test ran and the system behaved as expected. |
| Status **Fail** | The system does not yet do what the AC asks (a code gap). The automated test documents current behaviour. |
| Status **Not Executed** | A manual test case not yet run. |
| Remarks **Code gap** | Part of the AC is not implemented; the test proves what currently happens. |

**Run the tests:** `npm run test:e2e -- test/<file>.e2e-spec.ts`, against the local `connectsphere_test` database only.

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/calendar.e2e-spec.ts::lists only the published venues I manage` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | Available time is the absence of an entry; the UI shades it. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/calendar.e2e-spec.ts::marks pending as tentative, approved as confirmed and blocks as blocked` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/calendar.e2e-spec.ts::is denied to a Coordinator (403)` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | Switching views in the UI is covered by TC-S2-10 (manual). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/calendar.e2e-spec.ts::only returns entries in the requested window`<br>`test/calendar.e2e-spec.ts::accepts the exact windows the Day, Week and Month views ask for`<br>`test/calendar.e2e-spec.ts::excludes an entry from a day it does not touch`<br>`test/calendar.e2e-spec.ts::rejects a window over six weeks, or one that ends before it starts (400)` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/calendar.e2e-spec.ts::narrows the venues and entries to the chosen venue`<br>`test/calendar.e2e-spec.ts::returns nothing for a venue I do not manage` |

### TC-S2-06

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-06 |
| Story/AC ref | Story 16 AC-4 |
| Test Scenario | A booked slot shows its event details, and opening it shows the full booking |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-06-setup.sql on testDB (reset before test). Logged in as venue.staff@example.com. |
| Test Steps | 1. Open the calendar for 1-8 Oct.<br>2. Open the "Gala" slot (`GET /bookings/b-s2-06-gala`). |
| Test Data | Confirmed booking "Gala", Main Hall, 2 Oct 2030 09:00-12:00 UTC, 80 expected, organised by Olivia Organiser |
| Expected Result | The slot shows event "Gala", organiser Olivia Organiser, 09:00-12:00, 80 expected. Opening it returns the same booking with its event and venue. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/calendar.e2e-spec.ts::includes event name, organiser, time and attendance`<br>`test/calendar.e2e-spec.ts::opens the full booking for that slot (the click-through)` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/calendar.e2e-spec.ts::shows a booking as confirmed on the next read after it is approved`<br>`test/calendar.e2e-spec.ts::drops a booking from the calendar on the next read after it is cancelled`<br>`test/calendar.e2e-spec.ts::shows a rejected request as gone, not tentative` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/calendar.e2e-spec.ts::blocks out time, which then appears as BLOCKED`<br>`test/calendar.e2e-spec.ts::requires a reason and an end after the start (400)`<br>`test/calendar.e2e-spec.ts::refuses a venue I do not manage (404) and a Coordinator (403)`<br>`test/calendar.e2e-spec.ts::removes a block` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/calendar.e2e-spec.ts::reports existing bookings inside the new block`<br>`test/calendar.e2e-spec.ts::stops a Coordinator requesting, and staff approving, inside a block` |

### TC-S2-10

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-10 |
| Story/AC ref | Story 16 AC-2, AC-4 |
| Test Scenario | Switch between Day, Week and Month views, and open a booked slot |
| Pre-conditions | Log in as venue.staff@example.com on the running app. At least one booking exists on a venue you manage. |
| Test Steps | 1. Open Availability calendar.<br>2. Click Day, then Week, then Month.<br>3. Click a booked slot. |
| Test Data | Seed data on the running app |
| Expected Result | Each view shows the same bookings at the right times. Clicking a slot shows the event name, organiser, time and attendance. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result |  |
| Status | Not Executed |
| Remarks | Manual: the AC is about the user interface. |
| Executed By |  |
| Date of Execution |  |
| Automated by | Manual |

### TC-S2-11

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-11 |
| Story/AC ref | Story 16 AC-7 |
| Test Scenario | Use the calendar on a phone-sized screen |
| Pre-conditions | Log in as venue.staff@example.com. Browser window narrowed to about 400px, or a phone. |
| Test Steps | 1. Open the navigation bar under the header and choose Availability calendar.<br>2. Switch to Week and Month.<br>3. Tap a booked slot. |
| Test Data | Seed data on the running app |
| Expected Result | The page is reachable, nothing overflows the screen, the week and month views show as a day-by-day list, and tapping opens the details. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result |  |
| Status | Not Executed |
| Remarks | Manual: the AC is about the user interface. |
| Executed By |  |
| Date of Execution |  |
| Automated by | Manual |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | Code gap: blocked-off periods (Story 16) are not shown on this calendar, although AC-1 asks for them. Not tested until implemented. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-availability.e2e-spec.ts::defaults to every day of the current and next month`<br>`test/venues-availability.e2e-spec.ts::shows existing bookings for that venue`<br>`test/venues-availability.e2e-spec.ts::ignores another venue's bookings`<br>`test/venues-availability.e2e-spec.ts::is not cached` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-availability.e2e-spec.ts::returns exactly the requested future month`<br>`test/venues-availability.e2e-spec.ts::still loads a busy month within two seconds`<br>`test/venues-availability.e2e-spec.ts::rejects a malformed month`<br>`test/venues-availability.e2e-spec.ts::rejects a range longer than two months` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-availability.e2e-spec.ts::returns only date and status for every day`<br>`test/venues-availability.e2e-spec.ts::never mentions the event, its id, or its organiser`<br>`test/venues-availability.e2e-spec.ts::marks an approved day as booked` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-availability.e2e-spec.ts::marks a day with only a pending request as tentative`<br>`test/venues-availability.e2e-spec.ts::treats a rejected request as free` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-availability.e2e-spec.ts::refuses %s with 403`<br>`test/venues-availability.e2e-spec.ts::refuses an unauthenticated caller`<br>`test/venues-availability.e2e-spec.ts::reports a draft venue as not found`<br>`test/venues-availability.e2e-spec.ts::reports an unknown venue as not found` |

### TC-S2-17

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-17 |
| Story/AC ref | Story 17 AC-3, AC-4 |
| Test Scenario | See booked, tentative and free days styled differently on a venue's calendar |
| Pre-conditions | Log in as coord.a@example.com. A venue has one confirmed and one pending booking next month. |
| Test Steps | 1. Open the venue's details, then its availability calendar.<br>2. Go to next month. |
| Test Data | Seed data on the running app |
| Expected Result | Booked days are shaded, the pending day is styled as tentative (different from both), and no event name or organiser is shown. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result |  |
| Status | Not Executed |
| Remarks | Manual: the AC is about the user interface. |
| Executed By |  |
| Date of Execution |  |
| Automated by | Manual |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-search.e2e-spec.ts::US-18: an empty search returns every published venue`<br>`test/venues-search.e2e-spec.ts::US-18: never returns a draft venue, even one matching every filter`<br>`test/venues-search.e2e-spec.ts::US-18: is not cached` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-search.e2e-spec.ts::excludes a venue with an APPROVED booking overlapping the slot`<br>`test/venues-search.e2e-spec.ts::includes a venue with only a pending (REQUESTED) booking — AC-1 says "confirmed"`<br>`test/venues-search.e2e-spec.ts::includes venues with a rejected or back-to-back booking`<br>`test/venues-search.e2e-spec.ts::includes the approved venue again for a slot that does not overlap`<br>`test/venues-search.e2e-spec.ts::excludes a venue whose confirmed booking %s`<br>`test/venues-search.e2e-spec.ts::rejects half a range`<br>`test/venues-search.e2e-spec.ts::rejects a range that ends before it starts` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-search.e2e-spec.ts::includes a venue whose capacity equals the minimum`<br>`test/venues-search.e2e-spec.ts::excludes a venue one below the minimum`<br>`test/venues-search.e2e-spec.ts::rejects a non-numeric minimum` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-search.e2e-spec.ts::matches a venue offering the one selected feature`<br>`test/venues-search.e2e-spec.ts::excludes a venue missing one of several selected features`<br>`test/venues-search.e2e-spec.ts::accepts the list as a repeated key`<br>`test/venues-search.e2e-spec.ts::rejects a value outside the shared vocabulary` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-search.e2e-spec.ts::excludes a venue missing one selected facility`<br>`test/venues-search.e2e-spec.ts::includes every venue offering the selected facility`<br>`test/venues-search.e2e-spec.ts::rejects a value outside the Facility vocabulary` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-search.e2e-spec.ts::returns only the venue satisfying every dimension at once` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | The plain name lookup in the same file proves Story 15 AC-3, which belongs to Sprint 1. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-search.e2e-spec.ts::combines a name lookup with the other filters by AND` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-search.e2e-spec.ts::returns 200 with an empty array` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-search.e2e-spec.ts::searches 300 venues with 600 bookings in one round trip under 2s` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-search.e2e-spec.ts::refuses %s with 403`<br>`test/venues-search.e2e-spec.ts::refuses an unauthenticated caller` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-suitability.e2e-spec.ts::US-19: reports a suitable venue as positively SUITABLE, with each check shown` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-suitability.e2e-spec.ts::US-19: flags capacity and each missing accessibility requirement individually` |

### TC-S2-30

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-30 |
| Story/AC ref | Story 19 AC-3 |
| Test Scenario | Facilities are checked against the event's equipment/technical requirements |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-28-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Check Hall's suitability for event "Fits". |
| Test Data | — |
| Expected Result | AC-3: the system flags whether the venue's facilities cover the requirements. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Facilities and equipment are returned as null and listed under "not checked", with the reason. No facility check is made. |
| Status | Fail |
| Remarks | Code gap: AC-3 is not implemented. The test proves the check is reported as "not checked" (facilities and equipment null, with a reason) rather than faked as a pass. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution |  |
| Automated by | `test/venues-suitability.e2e-spec.ts::US-19: returns null for both with the reason` |

### TC-S2-31

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-31 |
| Story/AC ref | Story 19 AC-5 |
| Test Scenario | Suitability flags are advisory: the check changes nothing, and the request can still be submitted |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s2-28-setup.sql + tc-s2-31-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Check Hall's suitability for an event of 500 needing a hearing loop.<br>2. Submit the booking request anyway (`POST /bookings`). |
| Test Data | Hall holds 100, no hearing loop |
| Expected Result | The check returns NOT_SUITABLE and creates or changes nothing. The booking request is still accepted (201) as pending. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-suitability.e2e-spec.ts::US-19: changes nothing — no booking, reservation, notification or event edit`<br>`test/venues-suitability.e2e-spec.ts::US-19 AC-5: a booking request still submits after suitability reports flags` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-suitability.e2e-spec.ts::US-19: answers within two seconds` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/venues-suitability.e2e-spec.ts::US-19: hides another Coordinator's event as not found`<br>`test/venues-suitability.e2e-spec.ts::US-19: hides an unassigned event from the review pool`<br>`test/venues-suitability.e2e-spec.ts::US-19: hides a %s event as not found`<br>`test/venues-suitability.e2e-spec.ts::US-19: reports a draft venue as not found`<br>`test/venues-suitability.e2e-spec.ts::US-19: requires an eventId`<br>`test/venues-suitability.e2e-spec.ts::US-19: refuses %s with 403` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/bookings-request.e2e-spec.ts::rejects a request missing them, flagging each field`<br>`test/bookings-request.e2e-spec.ts::refuses %s (400) and creates nothing` |

### TC-S2-35

| Test case specification | |
|---|---|
| Test Case ID | TC-S2-35 |
| Story/AC ref | Story 20 AC-2, AC-3 |
| Test Scenario | The event's requirements are attached and the request is pending |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s2-34-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Request Main Hall for "Orientation", 1 Oct 2030 09:00-12:00 UTC, 120 expected. |
| Test Data | Orientation: theatre, hearing loop ("Two hearing aid users"), "2 wireless mics" |
| Expected Result | Created (201) as REQUESTED (pending), carrying the layout, accessibility needs, notes and equipment, with no warnings. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-18 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | Code gap (AC-2): the structured equipment list and "technical support needed" (Story 27) are not attached; only the free-text equipment notes are. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/bookings-request.e2e-spec.ts::creates a REQUESTED booking carrying the event requirements` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/bookings-request.e2e-spec.ts::returns 409 naming the conflicting booking, and creates nothing` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/bookings-request.e2e-spec.ts::allows a back-to-back slot that only touches the confirmed one` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/bookings-request.e2e-spec.ts::creates the request and warns about the pending one`<br>`test/bookings-request.e2e-spec.ts::names the conflicting request by event and time range` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/bookings-request.e2e-spec.ts::lists it under GET /bookings/mine for the requester only` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/bookings-request.e2e-spec.ts::denies an Organiser (403)`<br>`test/bookings-request.e2e-spec.ts::hides an event assigned to another Coordinator (404)`<br>`test/bookings-request.e2e-spec.ts::refuses an event that has not been approved yet (409)`<br>`test/bookings-request.e2e-spec.ts::shows full detail to the requester, the event's Organiser and the venue's manager only` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/bookings-queue.e2e-spec.ts::excludes other staff's venues and decided requests`<br>`test/bookings-queue.e2e-spec.ts::is denied to a Coordinator (403)` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/bookings-queue.e2e-spec.ts::carries event, venue, times, attendance, requester and organiser` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/bookings-queue.e2e-spec.ts::sorts by event date, soonest first, by default`<br>`test/bookings-queue.e2e-spec.ts::sorts by event date, latest first, when asked`<br>`test/bookings-queue.e2e-spec.ts::sorts by submission date when asked`<br>`test/bookings-queue.e2e-spec.ts::rejects an unknown sort field (400)` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/bookings-queue.e2e-spec.ts::filters by venue`<br>`test/bookings-queue.e2e-spec.ts::filters by date range`<br>`test/bookings-queue.e2e-spec.ts::filters the decided view by status` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | Threshold: 7 days, per the team's comment on the story. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/bookings-queue.e2e-spec.ts::puts requests under a week away at the top, flagged`<br>`test/bookings-queue.e2e-spec.ts::still flags a request whose event has started, with a negative day count` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/bookings-queue.e2e-spec.ts::GET /bookings/:id returns it with its requirements` |

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
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-18. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-18 |
| Automated by | `test/bookings-queue.e2e-spec.ts::moves a request out of Pending as soon as it is approved or rejected`<br>`test/bookings-queue.e2e-spec.ts::shows approved and rejected requests only under view=decided` |
