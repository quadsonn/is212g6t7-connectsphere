# Sprint 3 test cases

Written test cases for the Sprint 3 user stories (Story 38 onwards), traced from story → acceptance criterion → test case → automated test. Stories and ACs use the numbers in the Sprint 3 user-story document; in the code, Sprint 3 labels match those numbers (`US-40` is Story 40). ACs are numbered in the order the card lists them.

**In progress.** Done: **Story 38 and 39**. Stories 40 to 42 follow.

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
