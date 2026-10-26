# Sprint 3 test cases

Written test cases for the Sprint 3 user stories (Story 38 onwards), traced from story → acceptance criterion → test case → automated test. Stories and ACs use the numbers in the Sprint 3 user-story document; in the code, Sprint 3 labels match those numbers (`US-40` is Story 40). ACs are numbered in the order the card lists them.

**In progress.** Done: **Story 38 to 41**. Story 42 follows.

## How to read this file

- Each test case is one table in the course template. The top part is the test case specification; the bottom part is the test execution record.
- **Pre-conditions** name the exact SQL setup script(s). The automated test loads the same scripts, which is the traceability link. Scripts are in `test/fixtures/sql/` and listed in its [README](../../test/fixtures/sql/README.md). All users share the password `correct-horse-battery-staple`.
- **Expected Result** is written from the AC wording, not from the code. Code gaps and bugs are noted in Remarks, and each story ends with its AC ↔ code notes.
- **Automated by** gives `<type>: <file>::<exact test name>`. Unit tests are cited by their `describe` block where the whole block serves the test case. Names with `%s` are table-driven (`it.each`), and every row runs.
- Test case IDs start at **TC-S3-38** and run on from there.

**Test types**

| Type | Where | What it runs | Command |
|---|---|---|---|
| **Unit** | `src/**/*.spec.ts` | One service, rule or DTO on its own; Prisma and other dependencies mocked | `npm test` |
| **Integration** | `test/*.e2e-spec.ts` | The real Nest app over HTTP (Supertest) and the local `connectsphere_test` database. Every test resets the database, then loads its setup scripts | `npm run test:e2e -- <file>` |
| **UI** | `frontend/src/**/*.test.tsx` | React screens with React Testing Library and Vitest; the API mocked | `npm --prefix frontend test` |
| **E2E** (browser) | `e2e/*.spec.ts` | Playwright through the real app and the local test database | `npm run test:browser` |

All four use only the local test database (or none). None touches the shared Supabase database.

**Legend**

| Value | Meaning |
|---|---|
| Status **Pass** | The automated test ran and the system behaved as expected. |
| Status **Fail** | The system does not yet do what the AC asks (a bug or code gap). Where there is an automated test, `it.failing` marks a bug the test expects to stay failing until it is fixed. |
| Remarks **Code gap** | Part of the AC is not implemented; nothing can test it yet. |

---

## Story 38 Be Notified of Changes to My Registered Event (Attendee)

### TC-S3-38

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-38 |
| Story/AC ref | Story 38 AC-1 (approved change request) |
| Test Scenario | Approving a change request that moves the event's date and time notifies its Attendees |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-38-setup.sql on testDB (reset before test). `EVT-191` "Harbour Gala" is in PLANNING, 1 Oct 2030 09:00–17:00 (Singapore time), with Main Hall approved; `CRQ-006` asks to move it to 2 Oct 2030 09:00–18:00. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody approves `CRQ-006`.<br>2. Read the notifications recorded. |
| Test Data | `CRQ-006`: start 2 Oct 2030 09:00, end 2 Oct 2030 18:00 |
| Expected Result | A notification is generated for the event's Attendees once the change is applied. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The approval returned HTTP 200. Each Registered Attendee got one `EVENT_SCHEDULE_CHANGED` notification linked to `EVT-191`. |
| Status | Pass |
| Remarks | The notice is also sent after a planning edit of the date or time (unit-tested; not an AC trigger). |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us38-attendee-change-notifications.e2e-spec.ts::sends each Registered Attendee one notice listing every changed field, old and new`<br>Unit: `src/notifications/attendee-change-notifier.service.spec.ts::AttendeeChangeNotifier AC-1 / AC-3 / AC-4: one notification per Attendee carrying every change` |

### TC-S3-39

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-39 |
| Story/AC ref | Story 38 AC-1 (replacement venue, after a reversal) |
| Test Scenario | Approving a replacement venue for a booking Venue Staff reversed notifies the Attendees |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-39-setup.sql on testDB (reset before test). `EVT-192` "Riverside Fair" had Main Hall approved, then reversed to REJECTED ("Main Hall flooded"); Seminar Room is requested in its place. Logged in as venue.staff@example.com. |
| Test Steps | 1. Vera approves the Seminar Room booking `BKG-077`.<br>2. Read the notifications recorded. |
| Test Data | `BKG-077`, Seminar Room |
| Expected Result | A notification is generated for the Attendees when the replacement venue is applied. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The approval returned HTTP 200. Ann (the only Registered Attendee) got one notification: "Venue: Main Hall → Seminar Room". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us38-attendee-change-notifications.e2e-spec.ts::names the replaced venue and its replacement, not the event’s other venue` |

### TC-S3-40

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-40 |
| Story/AC ref | Story 38 AC-1 (replacement venue, through the Story 52 replacement request) |
| Test Scenario | Approving a replacement requested for a venue that became unavailable notifies the Attendees |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-40-setup.sql on testDB (reset before test). `EVT-193` "Lakeside Talk" has Main Hall approved and flagged as needing a replacement ("Main Hall closed for repairs"). Logged in as coord.a@example.com, then venue.staff@example.com. |
| Test Steps | 1. Cody requests Rooftop Terrace to replace `BKG-078`.<br>2. Vera approves the replacement.<br>3. Read the notifications recorded. |
| Test Data | Rooftop Terrace, 8 Oct 2030, 60 expected, `replacesBookingId` = `BKG-078` |
| Expected Result | A notification is generated for the Attendees, naming the old and new venue. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The request returned 201 and the approval 200, and Main Hall was released, but **no Attendee was notified**. |
| Status | Fail |
| Remarks | **Bug found by test audit (audit gap #4).** `BookingsService.notifyAttendeesIfVenueReplaced` only looks for an earlier booking that was approved and then REJECTED (a reversal, TC-S3-39). The Story 52 flow leaves the original APPROVED until the replacement is approved, then marks it RELEASED, so the lookup finds nothing. Captured as `it.failing`; switch it to `it` when fixed. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us38-attendee-change-notifications.e2e-spec.ts::tells Registered Attendees when a Story 52 replacement request is approved` (`it.failing`) |

### TC-S3-41

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-41 |
| Story/AC ref | Story 38 AC-2 |
| Test Scenario | Only Attendees whose registration is Registered are told; withdrawn ones are not |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-38-setup.sql on testDB (reset before test). `EVT-191` has Ann (`USR-001`) and Rita (`USR-014`) Registered, and Walt (`USR-015`) Withdrawn. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody approves `CRQ-006`.<br>2. List who received a schedule-change notification. |
| Test Data | As TC-S3-38 |
| Expected Result | Ann and Rita are notified. Walt is not, and nobody else is. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Recipients were exactly `USR-001` and `USR-014`. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us38-attendee-change-notifications.e2e-spec.ts::sends each Registered Attendee one notice listing every changed field, old and new`<br>Unit: `src/notifications/attendee-change-notifier.service.spec.ts::AttendeeChangeNotifier AC-2: every registered Attendee, and no withdrawn registration` |

### TC-S3-42

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-42 |
| Story/AC ref | Story 38 AC-3 |
| Test Scenario | The notice shows the event name and, for each changed field, the old and new value |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-38-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody approves `CRQ-006`.<br>2. Read the notification's text. |
| Test Data | As TC-S3-38 |
| Expected Result | The notice names "Harbour Gala" and shows Start 1 Oct 2030 09:00 → 2 Oct 2030 09:00 and End 1 Oct 2030 17:00 → 2 Oct 2030 18:00. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The text contained `"Harbour Gala"`, `Start: 1 Oct 2030, 09:00 → 2 Oct 2030, 09:00` and `End: 1 Oct 2030, 17:00 → 2 Oct 2030, 18:00`. |
| Status | Pass |
| Remarks | Times are shown in Singapore time. **The content is an in-app notification, not an email**: the app has no email delivery (see TC-S3-46). |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us38-attendee-change-notifications.e2e-spec.ts::sends each Registered Attendee one notice listing every changed field, old and new`<br>Unit: `src/notifications/event-schedule-change.spec.ts::event schedule change notice AC-3: shows the event name and each changed field with old and new value` |

### TC-S3-43

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-43 |
| Story/AC ref | Story 38 AC-4 |
| Test Scenario | Several fields changed in one update produce one notification listing all of them |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-38-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody approves `CRQ-006`, which changes the date, the start time and the end time.<br>2. Count each Attendee's notifications. |
| Test Data | As TC-S3-38 |
| Expected Result | Each Attendee gets one notification that lists Start and End together. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | One notification per Attendee, containing both the Start and the End line. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us38-attendee-change-notifications.e2e-spec.ts::sends each Registered Attendee one notice listing every changed field, old and new`<br>Unit: `src/notifications/event-schedule-change.spec.ts::event schedule change notice AC-4: several fields changed in one update are one message` |

### TC-S3-44

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-44 |
| Story/AC ref | Story 38 AC-5 |
| Test Scenario | For an event with several venues, a change to one names the affected venue |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-39-setup.sql on testDB (reset before test). `EVT-192` also has Rooftop Terrace approved, which does not change. Logged in as venue.staff@example.com. |
| Test Steps | 1. Vera approves Seminar Room (`BKG-077`) in place of Main Hall.<br>2. Read the notification's text. |
| Test Data | As TC-S3-39 |
| Expected Result | The notice names Main Hall and Seminar Room, and does not mention Rooftop Terrace. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The text contained `Venue: Main Hall → Seminar Room` and no mention of Rooftop Terrace. |
| Status | Pass |
| Remarks | Applies to the reversal route; the Story 52 route sends nothing (TC-S3-40). |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us38-attendee-change-notifications.e2e-spec.ts::names the replaced venue and its replacement, not the event’s other venue`<br>Unit: `src/notifications/event-schedule-change.spec.ts::event schedule change notice AC-5: a venue change names the affected venue` |

### TC-S3-45

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-45 |
| Story/AC ref | Story 38 AC-6 |
| Test Scenario | Changing a field other than date, time or venue notifies no one |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-38-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody edits only the description of `EVT-191` during planning.<br>2. Read the notifications recorded. |
| Test Data | Description "Now with a harbour fireworks finale" |
| Expected Result | The edit is saved and no Attendee is notified. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The edit returned HTTP 200; no schedule-change notification was recorded. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us38-attendee-change-notifications.e2e-spec.ts::sends nothing when only the description changes`<br>Unit: `src/notifications/event-schedule-change.spec.ts::event schedule change notice AC-6: other fields never produce a change`<br>Unit: `src/notifications/attendee-change-notifier.service.spec.ts::AttendeeChangeNotifier AC-6: nothing to report, nothing sent` |

### TC-S3-46

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-46 |
| Story/AC ref | Story 38 AC-7 |
| Test Scenario | Given email delivery fails, the worker retries and records the failure, and the event change is not blocked |
| Pre-conditions | — |
| Test Steps | 1. Make email delivery fail.<br>2. Let the worker process the notification. |
| Test Data | — |
| Expected Result | The notification is retried and the failure is recorded. The event change itself still succeeds. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Not testable: there is no email delivery and no polling worker. The "change is not blocked" half holds: a failure to record notifications is logged and the change still succeeds (unit tests). |
| Status | Fail |
| Remarks | **Code gap.** `NotificationsService` records in-app notifications only ("There is no email, push, websocket…"), so retry and failure recording cannot exist yet. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Unit: `src/notifications/attendee-change-notifier.service.spec.ts::AttendeeChangeNotifier best-effort: never fails the change that triggered it`<br>Unit: `src/notifications/notifications.service.spec.ts::NotificationsService notifySafely` |

**Story 38 AC ↔ code notes**
- **AC-1 (bug, audit gap #4):** a venue replaced through the Story 52 replacement request notifies no one (TC-S3-40). Only the reversal route notifies.
- **AC-3, AC-7 (code gap):** notifications are in-app records; there is no email or worker.

---

## Story 39 Be Notified of My Request Outcome (Event Organiser)

### TC-S3-47

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-47 |
| Story/AC ref | Story 39 AC-1 |
| Test Scenario | Approving, rejecting, returning for amendment and asking for clarification each generate a notification |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test, and before each decision). `EVT-146` "Freshman Orientation 2030" is SUBMITTED, owned by organiser@example.com and assigned to coord.a@example.com. Logged in as coord.a@example.com. |
| Test Steps | For each decision, on a fresh database:<br>1. Cody approves, rejects, returns or asks a question.<br>2. Read the notifications recorded. |
| Test Data | Reject "Clashes with exam week"; return "Add the catering numbers"; question "Which hall do you prefer?" |
| Expected Result | Each decision generates a notification. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Approve, reject and return each recorded one `EVENT_STATUS_CHANGED`; the question recorded one `CLARIFICATION_REQUESTED`. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us39-request-outcome-notifications.e2e-spec.ts::%s: one notice, to the Organiser only, with the event, outcome, reason and a link`<br>Unit: `src/events/events-decision-notification.service.spec.ts::EventsService decision notifications (Organiser) AC-1 / AC-3: one notification per decision, with the event, outcome and reason` |

### TC-S3-48

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-48 |
| Story/AC ref | Story 39 AC-2 |
| Test Scenario | The notification goes only to the Organiser who owns the request |
| Pre-conditions | As TC-S3-47 |
| Test Steps | For each decision: list every notification in the system. |
| Test Data | As TC-S3-47 |
| Expected Result | Exactly one notification exists, and it is Olivia's (`USR-006`). |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | For all four decisions the only notification was to `USR-006`. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us39-request-outcome-notifications.e2e-spec.ts::%s: one notice, to the Organiser only, with the event, outcome, reason and a link`<br>Unit: `src/events/events-decision-notification.service.spec.ts::EventsService decision notifications (Organiser) AC-2: only the Organiser who owns the request is notified` |

### TC-S3-49

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-49 |
| Story/AC ref | Story 39 AC-3 |
| Test Scenario | The notification shows the event name, the outcome, and the Coordinator's reason or message where one was given |
| Pre-conditions | As TC-S3-47. Logged in as organiser@example.com to read the inbox. |
| Test Steps | For each decision: Olivia opens her notifications. |
| Test Data | As TC-S3-47 |
| Expected Result | The notice names "Freshman Orientation 2030" and the outcome. Reject, return and clarification show their reason or question; approve has none. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Summaries contained the event name and "was approved" / "was rejected" / "was returned for amendment" / "asked a question". Reasons were "Clashes with exam week", "Add the catering numbers" and "Which hall do you prefer?"; approve's reason was null. |
| Status | Pass |
| Remarks | In-app, not email (see TC-S3-53). |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us39-request-outcome-notifications.e2e-spec.ts::%s: one notice, to the Organiser only, with the event, outcome, reason and a link`<br>Unit: `src/events/events-decision-notification.service.spec.ts::EventsService decision notifications (Organiser) AC-1 / AC-3: one notification per decision, with the event, outcome and reason` |

### TC-S3-50

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-50 |
| Story/AC ref | Story 39 AC-4 |
| Test Scenario | The notification links to the event in the system |
| Pre-conditions | As TC-S3-49 |
| Test Steps | For each decision: Olivia reads the notification's link. |
| Test Data | As TC-S3-47 |
| Expected Result | The link leads to her event's page. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The link was `/organiser/EVT-146` for every decision. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us39-request-outcome-notifications.e2e-spec.ts::%s: one notice, to the Organiser only, with the event, outcome, reason and a link` |

### TC-S3-51

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-51 |
| Story/AC ref | Story 39 AC-5 |
| Test Scenario | One notification is generated per decision, even if the decision is sent twice |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody approves `EVT-146`.<br>2. He approves it again.<br>3. Count the notifications. |
| Test Data | `EVT-146` |
| Expected Result | One notification only. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Both calls returned HTTP 200 (a repeat approve is a no-op); one notification was recorded. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us39-request-outcome-notifications.e2e-spec.ts::repeating an approve sends nothing more`<br>Unit: `src/events/events-decision-notification.service.spec.ts::EventsService decision notifications (Organiser) AC-5: one notification per decision, not per click` |

### TC-S3-52

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-52 |
| Story/AC ref | Story 39 AC-6 |
| Test Scenario | Saving a draft generates no notification |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com. |
| Test Steps | 1. Olivia saves a draft.<br>2. Count the notifications. |
| Test Data | Draft "Spring Fair (draft)" |
| Expected Result | The draft is saved and no notification is generated. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The draft returned HTTP 201; no notification was recorded. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us39-request-outcome-notifications.e2e-spec.ts::saving a draft records no notification`<br>Unit: `src/events/events-decision-notification.service.spec.ts::EventsService decision notifications (Organiser) AC-6: no notification when a draft is saved` |

### TC-S3-53

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-53 |
| Story/AC ref | Story 39 AC-7 |
| Test Scenario | Given email delivery fails, the worker retries and records the failure, and the decision is not blocked |
| Pre-conditions | — |
| Test Steps | 1. Make email delivery fail.<br>2. Let the worker process the notification. |
| Test Data | — |
| Expected Result | The notification is retried and the failure is recorded. The decision itself still succeeds. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Not testable: there is no email delivery and no polling worker. The "decision is not blocked" half holds: the notification is raised after the decision commits, and a failure to record it never undoes the decision (unit tests). |
| Status | Fail |
| Remarks | **Code gap**, as TC-S3-46. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Unit: `src/events/events-decision-notification.service.spec.ts::EventsService decision notifications (Organiser) a decision that is refused sends nothing`<br>Unit: `src/notifications/notifications.service.spec.ts::NotificationsService notifySafely` |

**Story 39 AC ↔ code notes**
- **AC-3, AC-7 (code gap):** notifications are in-app records; there is no email or worker.
- **AC-5:** a repeated approve returns 200 and changes nothing; it does not send a second notice.

---

## Story 40 Venue Activity Notifications (Venue Staff)

### TC-S3-54

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-54 |
| Story/AC ref | Story 40 AC-1 (new booking request) |
| Test Scenario | A new booking request for my venue notifies me |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-54-setup.sql on testDB (reset before test). Main Hall (`VEN-002`) is managed by venue.staff@example.com (Vera, `USR-010`); "Gala" (`EVT-194`) is in planning. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody requests Main Hall for the Gala, 1 Oct 2030 18:00–22:00 UTC.<br>2. Vera opens her notifications. |
| Test Data | Main Hall, 120 expected |
| Expected Result | Vera is notified of the new booking request. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The request returned 201. Vera had one unread `BOOKING_REQUEST_SUBMITTED` notification. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: notifies only the venue manager, with venue, event, what happened, when and a link` |

### TC-S3-55

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-55 |
| Story/AC ref | Story 40 AC-1 (approved booking changed) |
| Test Scenario | An approved booking's date, time or attendance changing notifies me; a booking that is not approved does not |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-54-setup.sql + tc-s3-55-setup.sql (Main Hall APPROVED, `BKG-079`), or + tc-s3-55b-setup.sql (Main Hall REQUESTED, `BKG-080`), on testDB (reset before test). Logged in as organiser@example.com, then coord.a@example.com. |
| Test Steps | 1. Olivia requests a change and Cody approves it: (a) to 8 Oct 2030; (b) to 200 expected.<br>2. Repeat (b) with the booking only REQUESTED.<br>3. Read Vera's notifications. |
| Test Data | New date 8 Oct 2030 18:00–22:00 UTC; attendance 120 → 200 |
| Expected Result | Vera is notified once per approved booking, with what changed. Nothing is sent for the booking that was not approved. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | (a) One `BOOKING_DETAILS_CHANGED` for the rebooked booking: "Time 1 Oct 2030, 18:00–22:00 UTC → 8 Oct 2030, 18:00–22:00 UTC. The approval carries over; no new decision is needed." (b) "Attendance 120 → 200." The REQUESTED booking produced none. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: a new date and time notifies the manager once per approved booking`<br>Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: an attendance change notifies the manager`<br>Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: a booking that was not APPROVED is not reported as changed` |

### TC-S3-56

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-56 |
| Story/AC ref | Story 40 AC-1 (event cancelled) |
| Test Scenario | An event using my venue is cancelled, and I am told |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-54-setup.sql + tc-s3-55-setup.sql + tc-s3-56-setup.sql on testDB (reset before test). The Gala has Main Hall APPROVED (Vera's) and East Annex REJECTED (Sam's, `USR-016`). |
| Test Steps | 1. The Gala is cancelled.<br>2. Read Vera's and Sam's notifications. |
| Test Data | — |
| Expected Result | Vera is told her booking was released. Sam, whose booking was already rejected, is not. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | One `BOOKING_EVENT_CANCELLED` to Vera for `BKG-079`: "Booking for 1 Oct 2030, 18:00–22:00 UTC released." Sam had none. |
| Status | Pass |
| Remarks | Cancelled through `EventsService.setStatus`, as the test file was written before the Story 43 endpoint. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: notifies the manager of each venue with a live booking, and no one else` |

### TC-S3-57

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-57 |
| Story/AC ref | Story 40 AC-1 (tentative hold) |
| Test Scenario | A tentative hold on my venue about to expire, or expired, notifies me |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-54-setup.sql + tc-s3-55b-setup.sql on testDB (reset before test). `BKG-080` stands in for a hold on Main Hall. |
| Test Steps | 1. The hold is about to expire (30 Sep 2030 12:00 UTC).<br>2. The hold expires.<br>3. Read Vera's and Sam's notifications. |
| Test Data | Expiry 30 Sep 2030 12:00 UTC |
| Expected Result | Vera gets an "expiring" then an "expired" notice about the hold; Sam gets none. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Vera got `HOLD_EXPIRING` ("…expires 30 Sep 2030, 12:00 UTC…") then `HOLD_EXPIRED`, both for `BKG-080`. Sam got none. |
| Status | Pass |
| Remarks | Calls the notifier directly. The hold workflow that triggers it is Story 54 and is tested with that story. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: the hold helpers notify the venue manager` |

### TC-S3-58

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-58 |
| Story/AC ref | Story 40 AC-2 |
| Test Scenario | I only get notifications for venues I manage |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-54-setup.sql (+ tc-s3-55-setup.sql + tc-s3-56-setup.sql for step 3) on testDB (reset before test). |
| Test Steps | 1. A request for Main Hall (Vera's).<br>2. A request for Old Gym (`VEN-040`, nobody's).<br>3. The Gala is cancelled.<br>4. Read Sam's notifications after each. |
| Test Data | — |
| Expected Result | Sam is never notified about Main Hall or Old Gym. Old Gym notifies nobody. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Sam's inbox stayed empty; the Old Gym request recorded no notification at all. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: notifies only the venue manager, with venue, event, what happened, when and a link`<br>Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: a venue with no manager notifies no one`<br>Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: notifies the manager of each venue with a live booking, and no one else` |

### TC-S3-59

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-59 |
| Story/AC ref | Story 40 AC-3 |
| Test Scenario | Each notification shows the venue, event name, what happened and when, and links to the related request |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-54-setup.sql on testDB (reset before test) for steps 1–2; test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s3-59-setup.sql + tc-s3-59b-setup.sql for step 3. |
| Test Steps | 1. Cody requests Main Hall for the Gala.<br>2. Vera reads the notification.<br>3. Each role reads a notice about an event. |
| Test Data | As TC-S3-54 |
| Expected Result | The notice names Main Hall and the Gala, says it was requested and for when, and links to the booking request. Each role's link goes to its own page for the event. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Vera's item had `relatedBooking.venue.name` "Main Hall", `relatedEvent.name` "Gala", summary "Requested for 1 Oct 2030, 18:00–22:00 UTC.", a `createdAt`, and link `/venues/bookings/<booking id>`. Role links were as expected (Organiser `/organiser/…`, Venue Staff `/venues/events/…`, Attendee none for an event in planning). |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: notifies only the venue manager, with venue, event, what happened, when and a link`<br>Integration: `test/notifications.e2e-spec.ts::roles with an event page get a link to it; others get none`<br>UI: `frontend/src/features/notifications/components/notification-bell.test.tsx::US-40 AC-3/AC-5: lists venue, event, what happened and when, newest first` |

### TC-S3-60

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-60 |
| Story/AC ref | Story 40 AC-4 |
| Test Scenario | An unread count shows in the navigation, and I can mark notifications read one at a time or all at once |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-54-setup.sql + tc-s3-60-setup.sql, or test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s3-59-setup.sql + tc-s3-60b-setup.sql / tc-s3-60c-setup.sql / tc-s3-61b-setup.sql, on testDB (reset before test). |
| Test Steps | 1. Read the unread count.<br>2. Mark one read; read the count.<br>3. Try to mark someone else's.<br>4. Mark all read.<br>5. Mark one unread again. |
| Test Data | Vera: 2 unread; Sam: 1 unread; Olivia: 3 unread |
| Expected Result | The count drops by one, then to zero; nobody can mark another user's notifications; mark all touches only my own; the bell shows the count. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Counts went 2 → 1 → 0 (Vera) and 3 → 2 → 0 (Olivia, `marked: 2`); marking another's returned 404 and left it unread; marking unread cleared `readAt` and counted again; a second mark kept the first read time. Every role could open its own inbox; no token gave 401. The bell's badge showed the count. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: unread count, mark one, mark all — and never someone else's`<br>Integration: `test/notifications.e2e-spec.ts::updates the count after marking one read, then all`<br>Integration: `test/notifications.e2e-spec.ts::refuses to mark another user’s notification (404), and leaves it unread`<br>Integration: `test/notifications.e2e-spec.ts::marks one unread again: it counts again and its read time is cleared`<br>Integration: `test/notifications.e2e-spec.ts::refuses to mark another user’s notification unread (404), leaving it read`<br>Integration: `test/notifications.e2e-spec.ts::marking one read twice keeps its first read time`<br>Integration: `test/notifications.e2e-spec.ts::mark all read touches only the caller’s notifications`<br>Integration: `test/notifications.e2e-spec.ts::%s can open their own notifications`<br>Integration: `test/notifications.e2e-spec.ts::is refused without a token (401)`<br>UI: `frontend/src/features/notifications/components/notifications.test.tsx::shows the unread count, and its dropdown links to the page`<br>UI: `frontend/src/features/notifications/components/notification-bell.test.tsx::US-40 AC-4: marks all as read` |

### TC-S3-61

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-61 |
| Story/AC ref | Story 40 AC-5 |
| Test Scenario | Notifications are listed newest first |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-54-setup.sql + tc-s3-61-setup.sql, or test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s3-59-setup.sql + tc-s3-61b-setup.sql / tc-s3-60b-setup.sql, on testDB (reset before test). |
| Test Steps | 1. Vera reads her feed two at a time.<br>2. Olivia and Cody read theirs. |
| Test Data | Vera: m1 (newest) to m5; Olivia: 10:00 and 12:00; Cody: 11:00 |
| Expected Result | Each user sees only their own, newest first, and paging neither repeats nor skips one. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Pages were [m1, m2], [m3, m4], [m5]; a limit of 0 or 101 gave 400. Olivia saw the 12:00 then the 10:00 notice; Cody only his. Stored reasons and links were shown for each story's notice. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: newest first, paginated with a cursor`<br>Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: rejects a limit outside 1–100`<br>Integration: `test/notifications.e2e-spec.ts::lists only the caller’s, newest first`<br>Integration: `test/notifications.e2e-spec.ts::shows the notification, its reason, the event and a link to it`<br>Integration: `test/notifications.e2e-spec.ts::US-47 AC-6: shows the unfulfillable rejection with its reason and comment`<br>Integration: `test/notifications.e2e-spec.ts::US-48 AC-9: shows the change request outcome with the reason` |

### TC-S3-62

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-62 |
| Story/AC ref | Story 40 AC-6 |
| Test Scenario | A notification appears within 1 minute of the action that triggered it |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-54-setup.sql (+ tc-s3-55-setup.sql for step 3) on testDB (reset before test). |
| Test Steps | 1. Cody requests Main Hall; Vera reads her notifications straight away.<br>2. A booking submission fails after notifying.<br>3. A cancellation is rolled back. |
| Test Data | — |
| Expected Result | The notice is there as soon as the action completes, and the page picks it up within a minute. An action that fails leaves no notification. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The notice was readable immediately after the request returned. The failed submission left no booking and no notification; the rolled-back cancellation left the event in PLANNING and no notification. The bell polls at most every 60 seconds. |
| Status | Pass |
| Remarks | Notices are written in the same transaction as the action, so "within 1 minute" depends on the page's polling interval (60 s). |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: notifies only the venue manager, with venue, event, what happened, when and a link`<br>Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: a failed booking submission leaves no notification`<br>Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: a cancellation rolled back leaves no notification`<br>UI: `frontend/src/features/notifications/components/notification-bell.test.tsx::US-40 AC-6: notifications poll at most every 60 seconds, on the shared interval` |

**Story 40 AC ↔ code notes**
- **AC-1 (holds):** TC-S3-57 calls the hold notifier directly; the hold workflow itself is Story 54.
- **AC-6:** met by writing the notice in the action's own transaction plus a 60-second poll on the page.

---

## Story 41 Suggest an Alternative Venue (Venue Staff)

### TC-S3-63

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-63 |
| Story/AC ref | Story 41 AC-1 |
| Test Scenario | When rejecting a request, Venue Staff can attach one or more alternative venues |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-63-setup.sql (+ tc-s3-63c-setup.sql: westHall; + tc-s3-63b-setup.sql: the booking already APPROVED) on testDB (reset before test). The Showcase (`EVT-196`, 80 people, theatre, step-free, 1 Oct 2030 09:00–12:00 UTC) has a REQUESTED booking of mainHall (`BKG-082`), managed by venue.staff@example.com (Vera); eastHall (100, step-free, theatre) is free. Logged in as venue.staff@example.com. |
| Test Steps | 1. Vera rejects with eastHall and westHall attached.<br>2. Vera rejects with none.<br>3. Vera sends a repeated venue, a non-list, or 11 venues.<br>4. Vera reverses an approved booking to rejected with eastHall; then tries alternatives on a reversal to approved.<br>5. Another venue's staff, a Coordinator and Technical Support try. |
| Test Data | eastHall, westHall; reason "Main Hall is closed for repairs." |
| Expected Result | The rejection is saved with the venues attached, in order. Alternatives are optional. Invalid lists, an approval with alternatives, and other users are refused, and nothing is saved. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Status REJECTED with suggestions [eastHall, westHall] (IDs `BSG-…`, consecutive). No alternatives: saved with `[]`. Bad lists: 400, still REQUESTED. Reversal to rejected carried eastHall; reversal to approved with alternatives: 400. Another venue's staff 404; Coordinator and Technical Support 403; no suggestion saved. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-suggestions.e2e-spec.ts::records the rejection with the venues attached`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::still rejects without alternatives, as before`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::refuses the same venue twice, a non-list, and too many`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::can be attached when a reversal rejects an approved booking, but not to an approval`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::is refused to %s (%i)`<br>UI: `frontend/src/features/bookings/components/suggestions.test.tsx::US-41 AC-1/AC-3: sends picked candidates and a manually chosen venue with the rejection` |

### TC-S3-64

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-64 |
| Story/AC ref | Story 41 AC-2 |
| Test Scenario | The system proposes candidate venues ranked by how well they match; each is free for the time (including setup and turnaround) and meets capacity and accessibility |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-63-setup.sql + tc-s3-64-setup.sql (a catalogue of fitting and unfitting venues), or + tc-s3-64b/64c/64d-setup.sql, on testDB (reset before test). The Showcase (`EVT-196`, 80 people, theatre, step-free, 1 Oct 2030 09:00–12:00 UTC) has a REQUESTED booking of mainHall (`BKG-082`), managed by venue.staff@example.com (Vera); eastHall (100, step-free, theatre) is free. |
| Test Steps | 1. Vera opens the alternatives for `BKG-082`.<br>2. Repeat with Main Hall itself fitting (64b), eastHall booked until 09:00 (64c), and no venue big enough (64d).<br>3. Another venue's staff, a Coordinator and the Organiser try. |
| Test Data | Catalogue in tc-s3-64-setup.sql |
| Expected Result | Candidates are only free, big-enough, step-free venues, best match first. Too small, not step-free, booked, blocked, turning around, unpublished and the requested venue are not proposed. Back-to-back counts as free. With nothing big enough, nothing is offered. Others cannot see the list. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Candidates were [eastHall, pendingHall, bigHall, flatHall]; eastHall first with spare capacity 20 and layout MET. Main Hall never appeared; eastHall booked until 09:00 still appeared; venues too small or within turnaround were in neither list; with none big enough both lists were empty. Others got 404/403. |
| Status | Pass |
| Remarks | A venue with only a pending request overlapping counts as free (pendingHall). |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-suggestions.e2e-spec.ts::proposes only free venues that meet capacity and accessibility, best match first`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::never proposes the venue the request asked for`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::allows a booking ending exactly when the slot starts (back-to-back)`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::Capacity AC-3: the list excludes venues too small for the expected attendance`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::Capacity AC-3: the list excludes venues that are not free, including within setup or turnaround time`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::Capacity AC-4: nothing is offered when no free venue is big enough`<br>Unit: `src/bookings/booking-alternatives.spec.ts::US-41 alternative venue ranking US-41 AC-2: a candidate meets the capacity and accessibility requirements`<br>Unit: `src/bookings/booking-alternatives.spec.ts::US-41 alternative venue ranking US-41 AC-2: candidates are ranked by how well they match`<br>UI: `frontend/src/features/bookings/components/suggestions.test.tsx::US-41 AC-2: shows the ranked candidates, best match first` |

### TC-S3-65

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-65 |
| Story/AC ref | Story 41 AC-3 |
| Test Scenario | Venue Staff pick from the candidates or choose another venue manually |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-63-setup.sql + tc-s3-64-setup.sql on testDB (reset before test). The Showcase (`EVT-196`, 80 people, theatre, step-free, 1 Oct 2030 09:00–12:00 UTC) has a REQUESTED booking of mainHall (`BKG-082`), managed by venue.staff@example.com (Vera); eastHall (100, step-free, theatre) is free. Logged in as venue.staff@example.com. |
| Test Steps | 1. Vera sees stairsHall (free, big enough, not step-free) offered for a manual choice, not as a candidate.<br>2. Vera rejects with eastHall and stairsHall.<br>3. Vera tries an unknown venue, an unpublished one, and Main Hall itself. |
| Test Data | eastHall, stairsHall; `no-such-venue`; draftHall; mainHall |
| Expected Result | A free venue outside the candidates can be chosen manually. Unknown, unpublished and the requested venue are refused. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | stairsHall was in `others`, not `candidates`; the rejection saved [eastHall, stairsHall]. Unknown: 400 "suggested venue not found: no-such-venue"; draft: 400; Main Hall: 400 "the venue this request asked for cannot be suggested as its alternative". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-suggestions.e2e-spec.ts::accepts a free venue that was not among the candidates`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::refuses an unknown or unpublished venue, or the requested venue itself`<br>UI: `frontend/src/features/bookings/components/suggestions.test.tsx::US-41 AC-1/AC-3: sends picked candidates and a manually chosen venue with the rejection` |

### TC-S3-66

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-66 |
| Story/AC ref | Story 41 AC-4 |
| Test Scenario | Venues that aren't free for the slot (or too small) can't be suggested, even through the API |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-63-setup.sql + tc-s3-66-setup.sql (eastHall APPROVED for another event 10:00–11:00), tc-s3-66b-setup.sql (eastHall blocked 08:00–10:00), tc-s3-66c-setup.sql (only a pending request), or tc-s3-64-setup.sql, on testDB (reset before test). The Showcase (`EVT-196`, 80 people, theatre, step-free, 1 Oct 2030 09:00–12:00 UTC) has a REQUESTED booking of mainHall (`BKG-082`), managed by venue.staff@example.com (Vera); eastHall (100, step-free, theatre) is free. Logged in as venue.staff@example.com. |
| Test Steps | 1. Vera rejects suggesting eastHall while it is booked, then while blocked.<br>2. With only a pending request on eastHall.<br>3. Suggesting turnaroundHall or alumniLounge (40 seats), on a rejection and on a reversal. |
| Test Data | eastHall; turnaroundHall; alumniLounge |
| Expected Result | A busy or too-small venue is refused, and the whole rejection is refused with nothing saved. A pending request does not make a venue busy. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Booked or blocked: 409 "eastHall is not free for the requested time, so it cannot be suggested"; request still REQUESTED, no decision or suggestion saved. Pending only: 200. turnaroundHall: 409. alumniLounge: 409 `CAPACITY_EXCEEDED`, on a rejection and on a reversal. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-suggestions.e2e-spec.ts::refuses a venue held by %s, and records nothing`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::allows a venue with only a pending request overlapping — it is not booked`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::Capacity AC-3: the list excludes venues that are not free, including within setup or turnaround time`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::Capacity AC-3: the server refuses an under-capacity venue even when the page is bypassed, and records nothing`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::Capacity AC-3: the same check applies when a reversal (US-52) suggests venues`<br>UI: `frontend/src/features/bookings/components/suggestions.test.tsx::US-41 AC-4: shows the server refusing a venue that is not free` |

### TC-S3-67

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-67 |
| Story/AC ref | Story 41 AC-5 |
| Test Scenario | The Coordinator sees the suggestions on the rejected request, along with the reason |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-63-setup.sql on testDB (reset before test); for the inbox, Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s3-59-setup.sql + tc-s3-67-setup.sql. The Showcase (`EVT-196`, 80 people, theatre, step-free, 1 Oct 2030 09:00–12:00 UTC) has a REQUESTED booking of mainHall (`BKG-082`), managed by venue.staff@example.com (Vera); eastHall (100, step-free, theatre) is free. Logged in as venue.staff@example.com, then coord.a@example.com (Cody) and coord.b@example.com. |
| Test Steps | 1. Vera rejects with eastHall, reason "Main Hall is closed for repairs.".<br>2. Cody opens the request and his notifications.<br>3. Casey (another Coordinator) opens the request. |
| Test Data | eastHall; reasons as above |
| Expected Result | Cody sees the reason and the suggested venue on the request, and his notification names them. Another Coordinator cannot see the request. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The request showed REJECTED, the reason, and eastHall (name, location, capacity, not yet accepted). The notice read "The booking of mainHall for "Showcase" was rejected. Reason: Closed for repairs. Alternative venues suggested: eastHall."; the inbox split out the reason with the alternatives. Casey got 404. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-suggestions.e2e-spec.ts::shows the reason and the suggested venues on the request`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::names the suggestions in the rejection notification`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::is not shown to another Coordinator`<br>Integration: `test/notifications.e2e-spec.ts::US-41: the Coordinator sees a rejection with its suggested alternatives`<br>UI: `frontend/src/features/bookings/components/suggestions.test.tsx::US-41 AC-5: shows the suggestions with the rejection reason` |

### TC-S3-68

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-68 |
| Story/AC ref | Story 41 AC-6 |
| Test Scenario | Accepting a suggestion creates a new booking request for that venue, pre-filled with the original details |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-63-setup.sql (+ tc-s3-66-setup.sql or tc-s3-68b-setup.sql loaded after the rejection) on testDB (reset before test). The Showcase (`EVT-196`, 80 people, theatre, step-free, 1 Oct 2030 09:00–12:00 UTC) has a REQUESTED booking of mainHall (`BKG-082`), managed by venue.staff@example.com (Vera); eastHall (100, step-free, theatre) is free. Logged in as venue.staff@example.com, then coord.a@example.com. |
| Test Steps | 1. Vera rejects suggesting eastHall.<br>2. Cody accepts it.<br>3. Cody accepts it again.<br>4. Variants: eastHall booked meanwhile; the original reversed to approved; eastHall cut to 50 seats; another request or Coordinator; Venue Staff, Organiser, Technical Support. |
| Test Data | eastHall |
| Expected Result | A new REQUESTED booking for eastHall with the original time, attendance and requirements; the original stays rejected and the suggestion records the new request. It can be accepted once, only on a rejected request, only by its Coordinator, and only if the venue is still free and big enough. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | 201: REQUESTED eastHall, 09:00–12:00, 80, requested by Cody, THEATRE, "Stage at the front.", STEP_FREE_ACCESS, "Two wheelchair users.", "Two projectors."; original REJECTED; suggestion linked. Again: 409 "this suggestion has already been accepted". Booked meanwhile: 409. After reversal: 409. Too small: 409 `CAPACITY_EXCEEDED`. Wrong request or Coordinator: 404. Other roles: 403. |
| Status | Pass |
| Remarks | The details come from the original booking request, not the event's later edits. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-suggestions.e2e-spec.ts::creates a pending request for the suggested venue with the original time, attendance and requirements`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::cannot accept the same suggestion twice`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::goes through the normal request checks: refused if the venue was booked meanwhile`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::is refused once a reversal has approved the original`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::404s for a suggestion of another request, or another Coordinator`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::is refused to %s (403)`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::Capacity AC-1/AC-2: refuses accepting a suggestion whose venue no longer holds the attendance`<br>UI: `frontend/src/features/bookings/components/suggestions.test.tsx::US-41 AC-6: accepting creates a request and opens it` |

### TC-S3-69

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-69 |
| Story/AC ref | Story 41 AC-7 |
| Test Scenario | Suggestions are recorded in the request's history |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-63-setup.sql + tc-s3-63c-setup.sql on testDB (reset before test). The Showcase (`EVT-196`, 80 people, theatre, step-free, 1 Oct 2030 09:00–12:00 UTC) has a REQUESTED booking of mainHall (`BKG-082`), managed by venue.staff@example.com (Vera); eastHall (100, step-free, theatre) is free. Logged in as venue.staff@example.com. |
| Test Steps | 1. Vera rejects suggesting eastHall.<br>2. She reverses to approved.<br>3. She reverses to rejected suggesting westHall.<br>4. She opens the request's history. |
| Test Data | eastHall, then westHall |
| Expected Result | Each decision is listed oldest first with its own suggestions and who decided. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | History: [REJECTED "Closed." [eastHall]], [APPROVED "Reopened." []], [REJECTED "Closed again." [westHall]], decided by Vera. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-suggestions.e2e-spec.ts::keeps each decision with its own suggestions, oldest first`<br>UI: `frontend/src/features/bookings/components/suggestions.test.tsx::US-41 AC-7: the history lists the suggestions with their decision` |

**Story 41 AC ↔ code notes**
- No mismatches. The file also holds the Capacity tests (a venue must hold the expected attendance); they are cited under AC-2, AC-4 and AC-6, where the AC asks for capacity.

