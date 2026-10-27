# Sprint 3 test cases

Written test cases for the Sprint 3 user stories (Story 38 onwards), traced from story → acceptance criterion → test case → automated test. Stories and ACs use the numbers in the Sprint 3 user-story document; in the code, Sprint 3 labels match those numbers (`US-40` is Story 40). ACs are numbered in the order the card lists them.

Done: **Story 38 to 57** (TC-S3-38 to 186). Story 45 is on hold while its code changes are under way; its test cases stand as written.

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
| Actual Result | Pages were [m1, m2], [m3, m4], [m5]; a limit of 0 or 101 gave 400; another user's notification as the cursor gave 404. Olivia saw the 12:00 then the 10:00 notice; Cody only his. Stored reasons and links were shown for each story's notice. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: newest first, paginated with a cursor`<br>Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: rejects a limit outside 1–100`<br>Integration: `test/us40-venue-notifications.e2e-spec.ts::US-40: refuses another user's notification as the paging cursor (404)`<br>Integration: `test/notifications.e2e-spec.ts::lists only the caller’s, newest first`<br>Integration: `test/notifications.e2e-spec.ts::shows the notification, its reason, the event and a link to it`<br>Integration: `test/notifications.e2e-spec.ts::US-47 AC-6: shows the unfulfillable rejection with its reason and comment`<br>Integration: `test/notifications.e2e-spec.ts::US-48 AC-9: shows the change request outcome with the reason` |

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
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-63-setup.sql (+ tc-s3-66-setup.sql or tc-s3-68b-setup.sql loaded after the rejection, or tc-s3-68c-setup.sql) on testDB (reset before test). The Showcase (`EVT-196`, 80 people, theatre, step-free, 1 Oct 2030 09:00–12:00 UTC) has a REQUESTED booking of mainHall (`BKG-082`), managed by venue.staff@example.com (Vera); eastHall (100, step-free, theatre) is free. Logged in as venue.staff@example.com, then coord.a@example.com. |
| Test Steps | 1. Vera rejects suggesting eastHall.<br>2. Cody accepts it.<br>3. Cody accepts it again.<br>4. Variants: eastHall booked meanwhile; the original reversed to approved; eastHall cut to 50 seats; another request or Coordinator; Venue Staff, Organiser, Technical Support. |
| Test Data | eastHall |
| Expected Result | A new REQUESTED booking for eastHall with the original time, attendance and requirements; the original stays rejected and the suggestion records the new request. It can be accepted once, only on a rejected request, only by its Coordinator, and only if the venue is still free and big enough. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | 201: REQUESTED eastHall, 09:00–12:00, 80, requested by Cody, THEATRE, "Stage at the front.", STEP_FREE_ACCESS, "Two wheelchair users.", "Two projectors."; original REJECTED; suggestion linked. Again: 409 "this suggestion has already been accepted". Booked meanwhile: 409. After reversal: 409. Too small: 409 `CAPACITY_EXCEEDED`. Slot already started, or no attendance recorded: 409, nothing created. Wrong request or Coordinator: 404. Other roles: 403. |
| Status | Pass |
| Remarks | The details come from the original booking request, not the event's later edits. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-suggestions.e2e-spec.ts::creates a pending request for the suggested venue with the original time, attendance and requirements`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::cannot accept the same suggestion twice`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::goes through the normal request checks: refused if the venue was booked meanwhile`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::is refused once a reversal has approved the original`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::refuses to accept the suggestion on %s (409), and creates nothing`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::404s for a suggestion of another request, or another Coordinator`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::is refused to %s (403)`<br>Integration: `test/bookings-suggestions.e2e-spec.ts::Capacity AC-1/AC-2: refuses accepting a suggestion whose venue no longer holds the attendance`<br>UI: `frontend/src/features/bookings/components/suggestions.test.tsx::US-41 AC-6: accepting creates a request and opens it` |

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

---

## Story 42 Confirm Event When Arrangements Are Ready (Event Coordinator)

### TC-S3-70

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-70 |
| Story/AC ref | Story 42 AC-1 |
| Test Scenario | Confirm is only possible when every venue booking is approved and all required equipment is reserved, or none was recorded |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-70-setup.sql plus, per case, tc-s3-70b-setup.sql (Hall A approved) with tc-s3-70c/70d/70e/70f-setup.sql or tc-s3-71d-setup.sql, on testDB (reset before test). "Graduation showcase" (`EVT-203`) is in PLANNING, 1 Nov 2030 10:00–14:00 UTC, assigned to coord.a@example.com (Cody). Logged in as coord.a@example.com. |
| Test Steps | 1. Read the readiness: Hall A approved and Room 2 pending; Hall A and Room 2 approved (Annex rejected) with no equipment; projectors only requested; projectors reserved and a free-text item ticked.<br>2. Try to confirm while not ready.<br>3. Have Venue Staff reverse Hall A while Confirm is in progress. |
| Test Data | Hall A, Room 2, Annex; 2 × Projector; "Stage lighting rig" |
| Expected Result | Ready only when every live venue booking is approved and every required item is reserved (or ticked, for free text). Otherwise Confirm is unavailable and the server refuses it. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Pending Room 2: not ready. Both approved, no equipment: `ready: true`, the rejected Annex ignored. Projectors only requested: "Projector not reserved (0 of 2)". Reserved and ticked: ready. Confirm when not ready: 409 with the checklist, status unchanged, no notification. Reversal during Confirm: 409 "No venue booked". The button is disabled until ready (UI). |
| Status | Pass |
| Remarks | A reservation still REQUESTED does not count as reserved. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-confirm.e2e-spec.ts::US-42 AC-1: two venues with one pending is not ready`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42 AC-1: every booking APPROVED and no equipment is ready`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42: only a REQUESTED reservation does not satisfy the line`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42: a fully reserved line and a ticked free-text line are ready`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42 AC-1/AC-2: an event that is not ready gets 409 with the checklist`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42: a booking reverted while Confirm waits for the venue lock is caught by the re-check`<br>Unit: `src/events/confirmation-readiness.rules.spec.ts::US-42 confirmation readiness rules venue bookings`<br>Unit: `src/events/confirmation-readiness.rules.spec.ts::US-42 confirmation readiness rules equipment`<br>UI: `frontend/src/features/events/components/confirm-arrangements-card.test.tsx::US-42 AC-1/AC-2: Confirm is disabled and the outstanding items are listed`<br>E2E: `e2e/us42-confirm.spec.ts::Confirm stays disabled and the checklist names what is missing` |

### TC-S3-71

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-71 |
| Story/AC ref | Story 42 AC-2 |
| Test Scenario | If anything is outstanding, the Coordinator sees a checklist of what is missing |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-70-setup.sql plus, per case, tc-s3-71/71b/71c/71d/71e-setup.sql (with tc-s3-70b-setup.sql where a venue must be approved), on testDB (reset before test). "Graduation showcase" (`EVT-203`) is in PLANNING, 1 Nov 2030 10:00–14:00 UTC, assigned to coord.a@example.com (Cody). Logged in as coord.a@example.com. |
| Test Steps | 1. Read the checklist with no venue; Hall A pending; Room 2 flagged for review; 1 of 2 projectors reserved; a free-text item unticked.<br>2. Tick the free-text item, then undo; tick a catalogue item; tick another event's item; edit the requirements leaving the ticked item unchanged. |
| Test Data | As listed |
| Expected Result | Each missing arrangement is named, e.g. "Venue booking still pending" or "Projector not reserved". Free-text items can be ticked by hand (who and when recorded) and unticked. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | "No venue booked"; "Venue booking at Hall A still pending"; "Venue booking at Room 2 needs conflict review"; "Projector not reserved (1 of 2)"; "Stage lighting rig - needs manual check". Ticking recorded Cody and a time; undo cleared both. A catalogue item: 400; another event's: 404. The tick survived an unchanged edit; the new item was unticked. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-confirm.e2e-spec.ts::US-42 AC-2: no venue booked`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42 AC-2: one REQUESTED booking is still pending`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42 AC-2: an APPROVED booking flagged for review needs conflict review`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42 AC-2: a linked line under-reserved reads 1 of 2`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42 AC-2: an unticked free-text line needs a manual check`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42: ticking records who and when; undo clears it`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42: a catalogue-linked line cannot be ticked (400)`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42: a line from another event is not found`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42: a tick survives an edit that leaves the line unchanged`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42 AC-1/AC-2: an event that is not ready gets 409 with the checklist`<br>Unit: `src/events/confirmation-readiness.rules.spec.ts::US-42 confirmation readiness rules US-42 AC-2: lists every outstanding item at once, venues first`<br>UI: `frontend/src/features/events/components/confirm-arrangements-card.test.tsx::US-42: ticking a free-text line marks it as checked by hand`<br>UI: `frontend/src/features/events/components/confirm-arrangements-card.test.tsx::US-42: unticking undoes the check`<br>E2E: `e2e/us42-confirm.spec.ts::Confirm stays disabled and the checklist names what is missing` |

### TC-S3-72

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-72 |
| Story/AC ref | Story 42 AC-3 |
| Test Scenario | Only the Coordinator assigned to the event can confirm it |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-70-setup.sql (+ tc-s3-70b-setup.sql or tc-s3-71d-setup.sql) on testDB (reset before test). "Graduation showcase" (`EVT-203`) is in PLANNING, 1 Nov 2030 10:00–14:00 UTC, assigned to coord.a@example.com (Cody). Logged in as coord.b@example.com (Casey, not assigned) and organiser@example.com. |
| Test Steps | 1. Casey and the Organiser read the readiness.<br>2. They try to tick a free-text item.<br>3. They try to confirm. |
| Test Data | — |
| Expected Result | Both are refused and nothing changes. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Casey got 404 (she cannot see the event) and the Organiser 403, for readiness, ticking and confirming; the event stayed in PLANNING. |
| Status | Pass |
| Remarks | Denied = 404 by design for a Coordinator who may not see the event. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-confirm.e2e-spec.ts::US-42: readiness is for the assigned Coordinator only`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42: a Coordinator not assigned to the event cannot see it (404); its Organiser gets 403`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42 AC-3: a Coordinator not assigned to the event cannot confirm it (404: they cannot see it)`<br>Unit: `src/events/event-confirmation.service.spec.ts::US-42 EventConfirmationService` |

### TC-S3-73

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-73 |
| Story/AC ref | Story 42 AC-4 |
| Test Scenario | On confirmation the status changes, with the time and who confirmed recorded |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-70-setup.sql + tc-s3-70b-setup.sql (+ tc-s3-73b-setup.sql: AWAITING_ARRANGEMENTS, or tc-s3-73c-setup.sql: APPROVED) on testDB (reset before test). "Graduation showcase" (`EVT-203`) is in PLANNING, 1 Nov 2030 10:00–14:00 UTC, assigned to coord.a@example.com (Cody). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody confirms the ready event (from AWAITING_ARRANGEMENTS, and from PLANNING).<br>2. He confirms again.<br>3. He tries an event that is only APPROVED. |
| Test Data | — |
| Expected Result | The event is confirmed, with who and when recorded. It cannot be confirmed twice, or before planning. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | 200: status AWAITING_SAFETY_CHECK, `arrangementsConfirmedById` = Cody, `arrangementsConfirmedAt` set. Second confirm: 409. APPROVED event: 409, unchanged. |
| Status | Pass |
| Remarks | **AC ↔ code (Week 7 Change 6):** the AC says the status becomes Confirmed; the code moves the event to AWAITING_SAFETY_CHECK, because Change 6 (Story 57) puts the Safety Officer's check between arrangements and Confirmed. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-confirm.e2e-spec.ts::US-42 AC-4: a ready event moves to AWAITING_SAFETY_CHECK with who and when`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42: confirming works from PLANNING too`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42: an event that is not in planning cannot be confirmed (409)`<br>Integration: `test/events-confirm.e2e-spec.ts::US-42: confirming twice is refused the second time (409)`<br>Unit: `src/events/event-confirmation.service.spec.ts::US-42 EventsService.setStatus records who confirmed`<br>UI: `frontend/src/features/events/components/confirm-arrangements-card.test.tsx::US-42 AC-4: when ready, Confirm asks first, then confirms and shows a toast`<br>E2E: `e2e/us42-confirm.spec.ts::a ready event is confirmed, and the Organiser sees it` |

### TC-S3-74

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-74 |
| Story/AC ref | Story 42 AC-5 |
| Test Scenario | The Organiser can see that the event is confirmed |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-70-setup.sql + tc-s3-70b-setup.sql on testDB (reset before test). "Graduation showcase" (`EVT-203`) is in PLANNING, 1 Nov 2030 10:00–14:00 UTC, assigned to coord.a@example.com (Cody). Logged in as coord.a@example.com, then organiser@example.com. |
| Test Steps | 1. Cody confirms.<br>2. The Organiser checks her notifications and opens her event. |
| Test Data | — |
| Expected Result | The Organiser is told, and her event shows it is confirmed. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | One `EVENT_STATUS_CHANGED` to the Organiser containing "Arrangements confirmed - awaiting safety review"; her view showed AWAITING_SAFETY_CHECK with `arrangementsConfirmedAt` set. The UI label reads "Arrangements confirmed - awaiting safety review". |
| Status | Pass |
| Remarks | |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-confirm.e2e-spec.ts::US-42 AC-5: the Organiser is notified and sees the new status`<br>Unit: `src/events/event-confirmation.service.spec.ts::US-42 EventConfirmationService`<br>UI: `frontend/src/features/events/components/confirm-arrangements-card.test.tsx::US-42 AC-5: the Organiser-facing label for the new status`<br>E2E: `e2e/us42-confirm.spec.ts::a ready event is confirmed, and the Organiser sees it` |

**Story 42 AC ↔ code notes**
- **AC-4 (Week 7 Change 6):** confirming moves the event to AWAITING_SAFETY_CHECK rather than Confirmed; the Safety Officer's approval (Story 57) comes before Confirmed.
- **AC-1:** a reservation still awaiting approval does not count as reserved.

---

## Story 43 Cancel an Event (Event Organiser)

### TC-S3-75

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-75 |
| Story/AC ref | Story 43 AC-1 |
| Test Scenario | Only my own events can be cancelled, from submitted until before the event starts; drafts, completed, cancelled and rejected events have no cancel option |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-75-setup.sql on testDB (reset before test). "Autumn Festival" (`EVT-205`, PLANNING, 5 Dec 2030) is Olivia's (organiser@example.com), with Main Hall and Rooftop Terrace approved, a hold on Seminar Room, 2 PA systems reserved, a pending change request, Ann Registered and Wendy Withdrawn. For the closed events, + tc-s3-75b-setup.sql; for another Organiser, tc-s1-22-setup.sql. Logged in as organiser@example.com. |
| Test Steps | 1. Olivia tries to cancel a draft, a rejected, a completed, a cancelled and an already-started event.<br>2. Another Organiser and a Coordinator try to cancel the Autumn Festival.<br>3. In the browser, Olivia opens a draft and a live event. |
| Test Data | `EVT-206` to `EVT-210` |
| Expected Result | Each is refused and unchanged; other users are refused; a draft shows no cancel option. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | All five got 409 ("a draft event cannot be cancelled" … "an event that has already started cannot be cancelled") and kept their status. Another Organiser 404, Coordinator 403. The browser showed no "Cancel event" on the draft. |
| Status | Pass |
| Remarks | Denied = 404 by design for another Organiser's event. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us43-cancel-event.e2e-spec.ts::refuses %s (%s) with 409 and leaves it as it was`<br>Integration: `test/us43-cancel-event.e2e-spec.ts::refuses another Organiser's event (404) and other roles (403)`<br>Unit: `src/events/event-cancellation.rules.spec.ts::event cancellation rules (US-43) AC-1: cancellable from submitted up to before the event starts`<br>Unit: `src/events/events-cancellation.service.spec.ts::EventsCancellationService (US-43) AC-1: only my own events, and only while cancellable`<br>E2E: `e2e/us43-cancel.spec.ts::a draft offers no Cancel; a live event is cancelled with a reason and shows Cancelled` |

### TC-S3-76

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-76 |
| Story/AC ref | Story 43 AC-2 |
| Test Scenario | A reason is required and the Organiser must confirm before the cancellation is applied |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-75-setup.sql on testDB (reset before test). "Autumn Festival" (`EVT-205`, PLANNING, 5 Dec 2030) is Olivia's (organiser@example.com), with Main Hall and Rooftop Terrace approved, a hold on Seminar Room, 2 PA systems reserved, a pending change request, Ann Registered and Wendy Withdrawn. Logged in as organiser@example.com. |
| Test Steps | 1. Olivia cancels with no reason, a blank reason, no confirmation, and confirm false.<br>2. In the browser, she cancels with a reason and confirms. |
| Test Data | Reason "Keynote speaker withdrew" |
| Expected Result | Without a reason or confirmation the cancellation is refused and nothing changes. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | All four got 400; the event stayed in PLANNING. The panel refuses a blank reason and sends `confirm: true` only on confirmation. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us43-cancel-event.e2e-spec.ts::refuses %s with 400 and cancels nothing`<br>Unit: `src/events/cancel-event.dto.spec.ts::CancelEventDto (US-43)`<br>UI: `frontend/src/features/events/components/cancel-event-panel.test.tsx::AC-2: refuses to cancel without a reason and sends nothing`<br>UI: `frontend/src/features/events/components/cancel-event-panel.test.tsx::AC-2: a whitespace-only reason does not count`<br>UI: `frontend/src/features/events/components/cancel-event-panel.test.tsx::AC-2: confirming sends the trimmed reason with confirm: true, then closes`<br>E2E: `e2e/us43-cancel.spec.ts::a draft offers no Cancel; a live event is cancelled with a reason and shows Cancelled` |

### TC-S3-77

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-77 |
| Story/AC ref | Story 43 AC-3 |
| Test Scenario | The status becomes Cancelled, and the reason, who and when are recorded in the change history |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-75-setup.sql on testDB (reset before test). "Autumn Festival" (`EVT-205`, PLANNING, 5 Dec 2030) is Olivia's (organiser@example.com), with Main Hall and Rooftop Terrace approved, a hold on Seminar Room, 2 PA systems reserved, a pending change request, Ann Registered and Wendy Withdrawn. Logged in as organiser@example.com. |
| Test Steps | 1. Olivia cancels with "Keynote speaker withdrew".<br>2. Read the event and its change history. |
| Test Data | Reason "Keynote speaker withdrew" |
| Expected Result | Status CANCELLED; a history entry with the reason, Olivia and the time. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | HTTP 200; status CANCELLED; one change entry by `USR-006`, timed at the cancellation, containing the reason and CANCELLED. The browser showed "Cancelled". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us43-cancel-event.e2e-spec.ts::cancels the event, releases everything in the same request, closes the change request and records the change`<br>Unit: `src/events/events-cancellation.service.spec.ts::EventsCancellationService (US-43) AC-3: the status becomes Cancelled, with the reason, who and when in the history`<br>E2E: `e2e/us43-cancel.spec.ts::a draft offers no Cancel; a live event is cancelled with a reason and shows Cancelled` |

### TC-S3-78

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-78 |
| Story/AC ref | Story 43 AC-4 |
| Test Scenario | Every venue booking (each venue of a multi-venue event), tentative hold and equipment reservation is released in the same request |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-75-setup.sql on testDB (reset before test). "Autumn Festival" (`EVT-205`, PLANNING, 5 Dec 2030) is Olivia's (organiser@example.com), with Main Hall and Rooftop Terrace approved, a hold on Seminar Room, 2 PA systems reserved, a pending change request, Ann Registered and Wendy Withdrawn. Logged in as organiser@example.com. |
| Test Steps | 1. Olivia cancels.<br>2. Read the bookings, hold and reservation. |
| Test Data | — |
| Expected Result | Both venue bookings, the hold and the reservation are released by that one request. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The response reported `{ venueBookings: 3, equipmentReservations: 1 }`; all three bookings (including the HELD hold) were RELEASED and `RSV-019` RELEASED. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us43-cancel-event.e2e-spec.ts::cancels the event, releases everything in the same request, closes the change request and records the change`<br>Integration: `test/us44-release-on-cancel.e2e-spec.ts::US-44: an event on two venues releases both, and tells each manager once`<br>Unit: `src/events/events-cancellation.service.spec.ts::EventsCancellationService (US-43) AC-4: venue bookings, holds and equipment are released in the same request` |

### TC-S3-79

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-79 |
| Story/AC ref | Story 43 AC-5 |
| Test Scenario | Released venue slots show as available in the availability calendar, and released equipment returns to the available quantity |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-75-setup.sql on testDB (reset before test). "Autumn Festival" (`EVT-205`, PLANNING, 5 Dec 2030) is Olivia's (organiser@example.com), with Main Hall and Rooftop Terrace approved, a hold on Seminar Room, 2 PA systems reserved, a pending change request, Ann Registered and Wendy Withdrawn. Logged in as coord.a@example.com and tech.support@example.com to read availability. |
| Test Steps | 1. Read Main Hall's calendar for 5 Dec 2030 and the PA system's availability.<br>2. Olivia cancels.<br>3. Read them again. |
| Test Data | 4 PA systems requested |
| Expected Result | Before: Main Hall booked, 2 of 4 available. After: Main Hall free, all 4 available. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Before: "booked" and `availableQuantity: 2`. After: "free" and `availableQuantity: 4`. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us43-cancel-event.e2e-spec.ts::shows Main Hall free and all 4 PA systems available`<br>Integration: `test/us44-release-on-cancel.e2e-spec.ts::US-44: calendar, availability and search show it free, and a new request for it succeeds and can be approved` |

### TC-S3-80

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-80 |
| Story/AC ref | Story 43 AC-6 |
| Test Scenario | Any pending change request on the event is closed |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-75-setup.sql on testDB (reset before test). "Autumn Festival" (`EVT-205`, PLANNING, 5 Dec 2030) is Olivia's (organiser@example.com), with Main Hall and Rooftop Terrace approved, a hold on Seminar Room, 2 PA systems reserved, a pending change request, Ann Registered and Wendy Withdrawn. Logged in as organiser@example.com. |
| Test Steps | 1. Olivia cancels.<br>2. Read `CRQ-007`. |
| Test Data | — |
| Expected Result | The pending change request is closed. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | `CRQ-007` became CLOSED. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us43-cancel-event.e2e-spec.ts::cancels the event, releases everything in the same request, closes the change request and records the change`<br>Unit: `src/events/events-cancellation.service.spec.ts::EventsCancellationService (US-43) AC-6: any pending change request is closed` |

### TC-S3-81

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-81 |
| Story/AC ref | Story 43 AC-7 |
| Test Scenario | A cancelled event cannot be edited, receive change requests, or accept new registrations |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-75-setup.sql on testDB (reset before test). "Autumn Festival" (`EVT-205`, PLANNING, 5 Dec 2030) is Olivia's (organiser@example.com), with Main Hall and Rooftop Terrace approved, a hold on Seminar Room, 2 PA systems reserved, a pending change request, Ann Registered and Wendy Withdrawn. Logged in as coord.a@example.com, organiser@example.com and attendee@example.com. |
| Test Steps | 1. Olivia cancels.<br>2. Cody edits the description; Olivia requests a change; Ann registers. |
| Test Data | — |
| Expected Result | All three are refused. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Edit: 409. Change request: 409. Registration: 404. |
| Status | Pass |
| Remarks | The registration is refused with 404 because Attendees cannot see a cancelled event (denied = 404). |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us43-cancel-event.e2e-spec.ts::refuses an edit, a change request and a registration`<br>Unit: `src/events/event-cancellation.rules.spec.ts::event cancellation rules (US-43) AC-7: a cancelled event is closed to edits, change requests and registrations` |

### TC-S3-82

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-82 |
| Story/AC ref | Story 43 AC-8 |
| Test Scenario | A cancellation notification is generated for the assigned Coordinator and all registered Attendees |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-75-setup.sql on testDB (reset before test). "Autumn Festival" (`EVT-205`, PLANNING, 5 Dec 2030) is Olivia's (organiser@example.com), with Main Hall and Rooftop Terrace approved, a hold on Seminar Room, 2 PA systems reserved, a pending change request, Ann Registered and Wendy Withdrawn. Logged in as organiser@example.com. |
| Test Steps | 1. Olivia cancels.<br>2. List the cancellation notices. |
| Test Data | — |
| Expected Result | Cody and Ann are notified with the event and reason; Wendy (withdrawn) is not. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | `EVENT_CANCELLED` to `USR-001` and `USR-004`, each naming "Autumn Festival" and the reason; none to `USR-019`. |
| Status | Pass |
| Remarks | Olivia also gets her own confirmation (US-65), checked in its own suite. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us43-cancel-event.e2e-spec.ts::notifies the Coordinator and the Registered Attendee, not the Withdrawn one`<br>Unit: `src/events/events-cancellation.service.spec.ts::EventsCancellationService (US-43) AC-8: the Coordinator and all registered Attendees are notified` |

**Story 43 AC ↔ code notes**
- No mismatches. AC-7: a registration on a cancelled event is refused with 404 (not visible), not 409.

---

## Story 44 Release Venue Booking on Event Cancellation (Venue Staff)

### TC-S3-83

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-83 |
| Story/AC ref | Story 44 AC-1 |
| Test Scenario | When an event is cancelled, all its venue bookings are released automatically, whether pending, tentative or confirmed |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-54-setup.sql + tc-s3-83-setup.sql on testDB (reset before test). The "Gala" (`EVT-194`) uses Main Hall (Vera, `USR-010`); East Annex is Sam's (`USR-016`); "Other" and "Next" are further events. Per test: tc-s3-83b (pending, held, confirmed, rejected), tc-s3-83d (flagged), tc-s3-55 + tc-s3-86 (two venues), tc-s3-55 + tc-s3-83e (equipment). |
| Test Steps | 1. Cancel the Gala.<br>2. Read its bookings (and equipment).<br>3. Make the release fail. |
| Test Data | — |
| Expected Result | Pending, held and confirmed bookings (on every venue, flagged or not) are released; a rejected one is untouched. A failed release cancels nothing. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | All live bookings RELEASED (flag cleared); the rejected one untouched; equipment RELEASED. With the release failing, the event stayed PLANNING with nothing released or sent. |
| Status | Pass |
| Remarks | Cancelled through `EventsService.setStatus`, which every cancelling path uses; the Story 43 endpoint is tested in TC-S3-78. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us44-release-on-cancel.e2e-spec.ts::US-44: pending, held and confirmed bookings become RELEASED with the reason and a timestamp; rejected ones are untouched`<br>Integration: `test/us44-release-on-cancel.e2e-spec.ts::US-44: a booking flagged "Conflict - needs review" is released too, and its flag cleared`<br>Integration: `test/us44-release-on-cancel.e2e-spec.ts::US-44: an event on two venues releases both, and tells each manager once`<br>Integration: `test/us44-release-on-cancel.e2e-spec.ts::US-44: the event's equipment is still released (US-33)`<br>Integration: `test/us44-release-on-cancel.e2e-spec.ts::US-44: if the release fails, the event is not cancelled and nothing is released or sent` |

### TC-S3-84

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-84 |
| Story/AC ref | Story 44 AC-2 |
| Test Scenario | The released slot shows as available in calendars and venue search straight away |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-54-setup.sql + tc-s3-83-setup.sql on testDB (reset before test). The "Gala" (`EVT-194`) uses Main Hall (Vera, `USR-010`); East Annex is Sam's (`USR-016`); "Other" and "Next" are further events. + tc-s3-55-setup.sql (Main Hall approved). |
| Test Steps | 1. Cancel the Gala.<br>2. Read Vera's calendar, Main Hall's availability and venue search.<br>3. Request and approve Main Hall for "Next". |
| Test Data | — |
| Expected Result | The slot is free everywhere at once, and can be booked again. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Calendar empty; both days "free"; search listed Main Hall; the new request got 201 with no warnings and was approved. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us44-release-on-cancel.e2e-spec.ts::US-44: calendar, availability and search show it free, and a new request for it succeeds and can be approved` |

### TC-S3-85

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-85 |
| Story/AC ref | Story 44 AC-3 |
| Test Scenario | The booking's status changes to Released, with the reason "Event cancelled" and a timestamp; the record is kept |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-54-setup.sql + tc-s3-83-setup.sql on testDB (reset before test). The "Gala" (`EVT-194`) uses Main Hall (Vera, `USR-010`); East Annex is Sam's (`USR-016`); "Other" and "Next" are further events. + tc-s3-83b, or tc-s3-55 (+ tc-s3-83c). |
| Test Steps | 1. Cancel the Gala (and "Other", by Olivia).<br>2. Read the bookings, their history and Vera's decided queue. |
| Test Data | — |
| Expected Result | RELEASED, "Event cancelled", a timestamp, the row kept, and the release in the booking's history. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | RELEASED with "Event cancelled" and `releasedAt`; all 4 rows kept; history RELEASE entries by the system (null) or by Olivia; the decided queue (and its RELEASED filter) listed the booking. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us44-release-on-cancel.e2e-spec.ts::US-44: pending, held and confirmed bookings become RELEASED with the reason and a timestamp; rejected ones are untouched`<br>Integration: `test/us44-release-on-cancel.e2e-spec.ts::US-44: each release is recorded in the booking history, by the system or by the canceller`<br>Integration: `test/us44-release-on-cancel.e2e-spec.ts::US-44: the release shows in the Venue Staff queue history as Released`<br>UI: `frontend/src/features/bookings/components/booking-decision-history.test.tsx::US-44: a release on cancellation reads "Released", with its reason, by the system` |

### TC-S3-86

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-86 |
| Story/AC ref | Story 44 AC-4 |
| Test Scenario | Venue Staff are notified that the booking was released |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-54-setup.sql + tc-s3-83-setup.sql on testDB (reset before test). The "Gala" (`EVT-194`) uses Main Hall (Vera, `USR-010`); East Annex is Sam's (`USR-016`); "Other" and "Next" are further events. + tc-s3-55-setup.sql + tc-s3-86-setup.sql. |
| Test Steps | 1. Cancel the Gala (Main Hall and East Annex).<br>2. List the notifications. |
| Test Data | — |
| Expected Result | Each venue's manager is told once. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | One `BOOKING_EVENT_CANCELLED` to Vera for Main Hall and one to Sam for East Annex ("Booking for … UTC released."). |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us44-release-on-cancel.e2e-spec.ts::US-44: an event on two venues releases both, and tells each manager once` |

### TC-S3-87

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-87 |
| Story/AC ref | Story 44 AC-5 |
| Test Scenario | Other bookings on the same venue are not affected |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + base-venues.sql + tc-s3-54-setup.sql + tc-s3-83-setup.sql on testDB (reset before test). The "Gala" (`EVT-194`) uses Main Hall (Vera, `USR-010`); East Annex is Sam's (`USR-016`); "Other" and "Next" are further events. + tc-s3-55 + tc-s3-87, or tc-s3-87b. |
| Test Steps | 1. Cancel the Gala.<br>2. Read "Other"'s Main Hall booking. |
| Test Data | — |
| Expected Result | Other events' bookings are unchanged (apart from a review flag the release resolves). |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | "Other"'s booking stayed APPROVED; its "Conflict - needs review" flag, caused only by the Gala's booking, was cleared. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us44-release-on-cancel.e2e-spec.ts::US-44: another event's booking on the same venue is unchanged`<br>Integration: `test/us44-release-on-cancel.e2e-spec.ts::US-44: releasing one of a clashing pair clears the other's review flag (US-51)` |

**Story 44 AC ↔ code notes**
- No mismatches.

---

## Story 45 Equipment Damage and Maintenance Status (Technical Support)

### TC-S3-88

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-88 |
| Story/AC ref | Story 45 AC-1 |
| Test Scenario | Mark a quantity of an item as Damaged or Under Maintenance (e.g. 2 of 10), leaving the rest available |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-88-setup.sql on testDB (reset before test). Wireless microphone `EQP-016`, 10 in stock; "Conference" `EVT-213`. Logged in as tech.support@example.com. |
| Test Steps | 1. Toby marks 2 of the 10 microphones Damaged. |
| Test Data | 2 of 10 |
| Expected Result | 2 are Damaged and 8 stay available. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Only the whole item can be marked: it becomes Damaged (or Under Maintenance) and all 10 are unavailable. Marking whole items works and is limited to Technical Support (others 403, no token 401). |
| Status | Fail |
| Remarks | **Code gap.** Equipment status is per item, not per unit: an item is Available, Damaged or Under Maintenance as a whole. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/equipment-status.e2e-spec.ts::sets the status to %s and returns the updated item`<br>Integration: `test/equipment-status.e2e-spec.ts::moves a damaged item into maintenance`<br>Integration: `test/equipment-status.e2e-spec.ts::shows the new status in the item detail the catalogue opens`<br>Integration: `test/equipment-status.e2e-spec.ts::is refused to %s — Technical Support only`<br>Unit: `src/equipment/equipment-status.spec.ts::US-45 equipment status rules US-45 AC-1/AC-3: which changes are allowed` |

### TC-S3-89

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-89 |
| Story/AC ref | Story 45 AC-2 |
| Test Scenario | A reason must be entered; the change cannot be saved without one |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-88-setup.sql on testDB (reset before test). Wireless microphone `EQP-016`, 10 in stock; "Conference" `EVT-213`. Logged in as tech.support@example.com. |
| Test Steps | 1. Toby changes the status with a missing, empty, blank or non-text reason.<br>2. With "  Cracked casing.  ". |
| Test Data | — |
| Expected Result | Without a reason it is refused and nothing changes; the reason is saved with who and when. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | 400 "a reason is required to change the status" each time, nothing recorded; with a reason the change saved "Cracked casing." (trimmed), from/to, Toby and the time. The database also refuses a blank reason. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/equipment-status.e2e-spec.ts::400s when the reason is %s, and changes nothing`<br>Integration: `test/equipment-status.e2e-spec.ts::records the change: from, to, trimmed reason, who and when`<br>Integration: `test/equipment-status.e2e-spec.ts::the database refuses a blank reason written around the API`<br>Integration: `test/equipment-status.e2e-spec.ts::shows the latest reason in the item detail` |

### TC-S3-90

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-90 |
| Story/AC ref | Story 45 AC-3 |
| Test Scenario | Set a quantity of units back to Available once repaired |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-88-setup.sql on testDB (reset before test). Wireless microphone `EQP-016`, 10 in stock; "Conference" `EVT-213`. Logged in as tech.support@example.com. |
| Test Steps | 1. Toby marks the microphones Damaged, then sets 2 of them back. |
| Test Data | 2 units |
| Expected Result | 2 units become available again. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The whole item can be set back to Available (with a reason); individual units cannot. |
| Status | Fail |
| Remarks | **Code gap.** Equipment status is per item, not per unit: an item is Available, Damaged or Under Maintenance as a whole. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/equipment-status.e2e-spec.ts::moves %s back to OPERATIONAL, with a reason`<br>Integration: `test/equipment-status.e2e-spec.ts::requires a reason to set it back too`<br>Unit: `src/equipment/equipment-status.spec.ts::US-45 equipment status rules US-45 AC-1/AC-3: which changes are allowed` |

### TC-S3-91

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-91 |
| Story/AC ref | Story 45 AC-4 |
| Test Scenario | Cannot mark more units than are working, or set back more than are damaged or under maintenance |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-88-setup.sql on testDB (reset before test). Wireless microphone `EQP-016`, 10 in stock; "Conference" `EVT-213`. Logged in as tech.support@example.com. |
| Test Steps | 1. Toby marks 11 of 10 Damaged.<br>2. He sets back more than are damaged. |
| Test Data | 11 of 10 |
| Expected Result | Both are refused. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Not testable: there are no unit counts. The nearest rule: setting an item to the status it already has is refused (409 "this item is already Available"). |
| Status | Fail |
| Remarks | **Code gap.** Equipment status is per item, not per unit: an item is Available, Damaged or Under Maintenance as a whole. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/equipment-status.e2e-spec.ts::409s when the item already has that status, and records nothing` |

### TC-S3-92

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-92 |
| Story/AC ref | Story 45 AC-5 |
| Test Scenario | Damaged or under-maintenance units are excluded from availability checks and reservations; the catalogue shows the breakdown (e.g. "8 available, 2 damaged") |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-88-setup.sql on testDB (reset before test). Wireless microphone `EQP-016`, 10 in stock; "Conference" `EVT-213`. Logged in as tech.support@example.com. |
| Test Steps | 1. Toby marks the item Damaged, then Under Maintenance.<br>2. He checks availability and tries to reserve one.<br>3. He sets it back and tries again. |
| Test Data | 1 and 10 units |
| Expected Result | Unavailable units are excluded, reservations refused, and the breakdown shown. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Excluded: `availableQuantity: 0`, `unavailableQuantity: 10`, and reserving got 409 "Wireless microphone is damaged (out of service)…"; once Available, 10 were free and could be reserved. No per-unit breakdown exists. |
| Status | Fail |
| Remarks | **Code gap.** Equipment status is per item, not per unit: an item is Available, Damaged or Under Maintenance as a whole. The exclusion part passes; the "8 available, 2 damaged" breakdown cannot exist. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/equipment-status.e2e-spec.ts::a %s item has no free units and cannot be committed`<br>Integration: `test/equipment-status.e2e-spec.ts::is available and committable again once set back to Available` |

### TC-S3-93

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-93 |
| Story/AC ref | Story 45 AC-6 |
| Test Scenario | A warning lists existing reservations affected by the change, including how many units each is short |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-88-setup.sql on testDB (reset before test). Wireless microphone `EQP-016`, 10 in stock; "Conference" `EVT-213`. Logged in as tech.support@example.com. + tc-s3-93-setup.sql / tc-s3-93b-setup.sql / tc-s3-93c-setup.sql. |
| Test Steps | 1. Toby previews and then makes a status change with upcoming reservations of the item. |
| Test Data | 2 and 3 microphones reserved |
| Expected Result | Each affected reservation is listed, soonest first, with how many units it is short. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Live, upcoming reservations of the item were listed soonest first (event, coordinator, quantity, status); released, rejected, past and other items' were left out; nothing listed when setting back; the preview matched. There is no "short by" count (the whole item is out). |
| Status | Fail |
| Remarks | **Code gap.** Equipment status is per item, not per unit: an item is Available, Damaged or Under Maintenance as a whole. The list part passes; "how many units each is short" is missing. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/equipment-status.e2e-spec.ts::lists live, upcoming reservations of the item, soonest first`<br>Integration: `test/equipment-status.e2e-spec.ts::leaves out reservations that are released, rejected, already over, or for another item`<br>Integration: `test/equipment-status.e2e-spec.ts::lists nothing when an item is set back to Available`<br>Integration: `test/equipment-status.e2e-spec.ts::shows the same list before the change is saved, for the warning`<br>Integration: `test/equipment-status.e2e-spec.ts::the preview is Technical Support only, and 404s for an unknown item`<br>Unit: `src/equipment/equipment-status.spec.ts::US-45 equipment status rules US-45 AC-5: which changes affect reservations` |

### TC-S3-94

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-94 |
| Story/AC ref | Story 45 AC-7 |
| Test Scenario | Affected reservations are flagged as short until they fit again, without any being cancelled automatically |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-88-setup.sql on testDB (reset before test). Wireless microphone `EQP-016`, 10 in stock; "Conference" `EVT-213`. Logged in as tech.support@example.com. + tc-s3-93c-setup.sql. |
| Test Steps | 1. Toby marks the item Damaged with 2 reserved.<br>2. Read the reservation. |
| Test Data | — |
| Expected Result | The reservation is kept and flagged as short. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The reservation stayed APPROVED (not cancelled). No "short" flag exists. |
| Status | Fail |
| Remarks | **Code gap.** Equipment status is per item, not per unit: an item is Available, Damaged or Under Maintenance as a whole. The "not cancelled" part passes. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/equipment-status.e2e-spec.ts::warns without changing the reservations themselves` |

### TC-S3-95

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-95 |
| Story/AC ref | Story 45 AC-8 |
| Test Scenario | Suggest an alternative item for an affected confirmed event, choosing only from items available in the needed quantity for its date and time |
| Pre-conditions | — |
| Test Steps | — |
| Test Data | — |
| Expected Result | Only available items can be suggested. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Not testable: not built. There is no equipment suggestion, accept/decline, or reduce/release of a reservation. |
| Status | Fail |
| Remarks | **Code gap.** Nothing in `src/equipment` implements it. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | — |

### TC-S3-96

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-96 |
| Story/AC ref | Story 45 AC-9 |
| Test Scenario | The Coordinator sees the suggestion on the event, with the reason, and accepts or declines it |
| Pre-conditions | — |
| Test Steps | — |
| Test Data | — |
| Expected Result | The Coordinator can accept or decline. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Not testable: not built. There is no equipment suggestion, accept/decline, or reduce/release of a reservation. |
| Status | Fail |
| Remarks | **Code gap.** Nothing in `src/equipment` implements it. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | — |

### TC-S3-97

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-97 |
| Story/AC ref | Story 45 AC-10 |
| Test Scenario | On accept the alternative is reserved and the short reservation reduced or released; on decline the original is kept |
| Pre-conditions | — |
| Test Steps | — |
| Test Data | — |
| Expected Result | Accept and decline behave as described. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Not testable: not built. There is no equipment suggestion, accept/decline, or reduce/release of a reservation. |
| Status | Fail |
| Remarks | **Code gap.** Nothing in `src/equipment` implements it. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | — |

### TC-S3-98

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-98 |
| Story/AC ref | Story 45 AC-11 |
| Test Scenario | Reduce or release an affected reservation, with a reason, to resolve a shortage |
| Pre-conditions | — |
| Test Steps | — |
| Test Data | — |
| Expected Result | The reservation can be reduced or released with a reason. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Not testable: not built. There is no equipment suggestion, accept/decline, or reduce/release of a reservation. |
| Status | Fail |
| Remarks | **Code gap.** Nothing in `src/equipment` implements it. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | — |

**Story 45 AC ↔ code notes**
- **Code gap (AC-1, AC-3 to AC-11):** status is per item, not per unit, and there are no shortage counts, flags, alternative suggestions or reduce/release. Reasons (AC-2), exclusion from availability (AC-5) and the list of affected reservations (AC-6) work for whole items.

---

## Story 46 Enforce Registration Period and Capacity at Sign-up (Attendee)

### TC-S3-99

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-99 |
| Story/AC ref | Story 46 AC-1 |
| Test Scenario | A registration before registration opens or after it closes is rejected, and the open and close times are shown |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s3-99b-setup.sql on testDB (reset before test). "Now" is frozen at 1 Mar 2030 00:00 UTC; the events are CONFIRMED with registration enabled. Logged in as Attendees a1 to a8. |
| Test Steps | 1. a1 registers for `EVT-217` (opens in 2 days) and `EVT-218` (closed 1 second ago).<br>2. a1 reads the register options. |
| Test Data | — |
| Expected Result | Both are refused, with the open and close times. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Both 409, messages containing both times; options showed `NOT_YET_OPEN` / `CLOSED` with `opensAt` and `closesAt`; no registration stored. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/registrations-period-capacity.e2e-spec.ts::rejects a registration submitted before registration opens, and shows the times`<br>Integration: `test/registrations-period-capacity.e2e-spec.ts::rejects a registration submitted after registration closes, and shows the times`<br>Unit: `src/registrations/registration-rules.spec.ts::registration rules evaluateRegistration` |

### TC-S3-100

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-100 |
| Story/AC ref | Story 46 AC-2 |
| Test Scenario | A registration submitted at or before the closing time is accepted |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s3-99b-setup.sql on testDB (reset before test). "Now" is frozen at 1 Mar 2030 00:00 UTC; the events are CONFIRMED with registration enabled. Logged in as Attendees a1 to a8. |
| Test Steps | 1. a1 registers for `EVT-219` (closes tomorrow).<br>2. a1 registers for `EVT-228`, which closes exactly now. |
| Test Data | — |
| Expected Result | Both are accepted. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Both 201. |
| Status | Pass |
| Remarks | The card notes the at-or-before boundary is an assumption to confirm with the customer; the code accepts exactly at the closing time. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/registrations-period-capacity.e2e-spec.ts::accepts a registration inside the period`<br>Integration: `test/registrations-period-capacity.e2e-spec.ts::accepts a registration submitted exactly at the closing time`<br>Unit: `src/registrations/registration-rules.spec.ts::registration rules evaluateRegistration` |

### TC-S3-101

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-101 |
| Story/AC ref | Story 46 AC-3 |
| Test Scenario | When active registrations equal the capacity, a registration is rejected with a "full" message |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s3-99b-setup.sql on testDB (reset before test). "Now" is frozen at 1 Mar 2030 00:00 UTC; the events are CONFIRMED with registration enabled. Logged in as Attendees a1 to a8. |
| Test Steps | 1. a1 and a2 fill `EVT-221` (2 places).<br>2. a3 registers. |
| Test Data | 2 places |
| Expected Result | a3 is refused as full. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | 409 with a "full" message; still 2 registered; options showed `FULL`, 2 of 2. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/registrations-period-capacity.e2e-spec.ts::rejects with a "full" message once active registrations equal the capacity`<br>Integration: `test/registrations-period-capacity.e2e-spec.ts::lets a withdrawn Attendee register again only while a place remains`<br>Unit: `src/registrations/registration-rules.spec.ts::registration rules evaluateRegistration` |

### TC-S3-102

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-102 |
| Story/AC ref | Story 46 AC-4 |
| Test Scenario | Withdrawn registrations do not count toward capacity |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s3-99b-setup.sql on testDB (reset before test). "Now" is frozen at 1 Mar 2030 00:00 UTC; the events are CONFIRMED with registration enabled. Logged in as Attendees a1 to a8. |
| Test Steps | 1. a1 takes the only place of `EVT-222`; a2 is refused.<br>2. a1 withdraws; a2 registers. |
| Test Data | 1 place |
| Expected Result | The withdrawal frees the place. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | a2 refused (409), then accepted (201) after a1 withdrew; a1 could not take it back once a2 had it. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/registrations-period-capacity.e2e-spec.ts::does not count a withdrawn registration, so its place can be taken`<br>Integration: `test/registrations-period-capacity.e2e-spec.ts::lets a withdrawn Attendee register again only while a place remains` |

### TC-S3-103

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-103 |
| Story/AC ref | Story 46 AC-5 |
| Test Scenario | Given one place remains and two Attendees submit at the same time, exactly one registration succeeds |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s3-99b-setup.sql on testDB (reset before test). "Now" is frozen at 1 Mar 2030 00:00 UTC; the events are CONFIRMED with registration enabled. Logged in as Attendees a1 to a8. |
| Test Steps | 1. a1 and a2 register for `EVT-222` (1 place) at the same moment.<br>2. a1 to a8 race for `EVT-223` (3 places). |
| Test Data | — |
| Expected Result | Exactly one, then exactly three, succeed. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | [201, 409] for the pair; 3 × 201 and 5 × 409 for the eight; never over-filled. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/registrations-period-capacity.e2e-spec.ts::lets exactly one of two Attendees take the last remaining place`<br>Integration: `test/registrations-period-capacity.e2e-spec.ts::never over-fills when many Attendees race for a few places` |

### TC-S3-104

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-104 |
| Story/AC ref | Story 46 AC-6 |
| Test Scenario | The period and capacity are enforced by the server, so a direct API call outside the period or over capacity is rejected |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s3-99b-setup.sql on testDB (reset before test). "Now" is frozen at 1 Mar 2030 00:00 UTC; the events are CONFIRMED with registration enabled. Logged in as Attendees a1 to a8. |
| Test Steps | 1. Call the API directly: outside the period, over capacity, and for an event that does not allow registration. |
| Test Data | — |
| Expected Result | Each is refused by the server. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Every direct call was refused (409) with nothing stored. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/registrations-period-capacity.e2e-spec.ts::rejects a registration submitted before registration opens, and shows the times`<br>Integration: `test/registrations-period-capacity.e2e-spec.ts::rejects a registration submitted after registration closes, and shows the times`<br>Integration: `test/registrations-period-capacity.e2e-spec.ts::rejects with a "full" message once active registrations equal the capacity`<br>Integration: `test/registrations-period-capacity.e2e-spec.ts::rejects a direct API call for an event that does not allow registration at all` |

### TC-S3-105

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-105 |
| Story/AC ref | Story 46 AC-7 |
| Test Scenario | The UI hides or disables the register option, with the reason shown, when registration is closed or full |
| Pre-conditions | None (UI test; the registration options are mocked). |
| Test Steps | 1. Render the Register option when registration is not yet open, closed, full, and open. |
| Test Data | — |
| Expected Result | Disabled with the reason when not open, closed or full; enabled with no reason when open. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Register was disabled with "Registration opens…", "Registration closed…" and "…full — all 50 places are taken" as its description; enabled when open. |
| Status | Pass |
| Remarks | New UI test added this session. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | UI: `frontend/src/features/registrations/components/register-action.test.tsx::US-46 AC-7: %s — Register is disabled, with the reason beside it`<br>UI: `frontend/src/features/registrations/components/register-action.test.tsx::US-46 AC-7: open with places left — Register is enabled, with no reason` |

### TC-S3-106

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-106 |
| Story/AC ref | Story 46 AC-8 |
| Test Scenario | No waiting list: a full event just rejects |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s3-99b-setup.sql on testDB (reset before test). "Now" is frozen at 1 Mar 2030 00:00 UTC; the events are CONFIRMED with registration enabled. Logged in as Attendees a1 to a8. |
| Test Steps | 1. a1 takes the only place; a2 registers. |
| Test Data | 1 place |
| Expected Result | a2 is refused and nothing is kept for them. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | 409; only a1's registration exists. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/registrations-period-capacity.e2e-spec.ts::has no waiting list: a full event simply rejects` |

**Story 46 AC ↔ code notes**
- **AC-2:** the at-or-before-closing boundary is the team's assumption (card note); the code accepts at exactly the closing time.

---

## Story 47 Reject Unfulfillable Request (Event Coordinator)

### TC-S3-107

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-107 |
| Story/AC ref | Story 47 AC-1 |
| Test Scenario | The Coordinator can reject a request from the event details page |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-107-setup.sql on testDB (reset before test). "gala" (`EVT-238`, PLANNING) is Cody's (coord.a@example.com), with a pending hold on hallA, hallB approved, a rejected hallC request, and 3 projectors approved plus 1 requested. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody rejects "gala" as unfulfillable.<br>2. Another Coordinator, the Organiser, Venue Staff, Technical Support and an Attendee try. |
| Test Data | NO_SUITABLE_VENUE, "Every hall is booked that week." |
| Expected Result | Cody can reject it; nobody else can. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Cody: 200. Another Coordinator: 404 (nothing changed, no notice); the other roles: 403. The event page's form submits the rejection (UI). |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-reject-unfulfillable.e2e-spec.ts::rejects the event and stores the reason and comment`<br>Integration: `test/events-reject-unfulfillable.e2e-spec.ts::refuses another Coordinator (404: the event is not theirs to see), changing nothing`<br>Integration: `test/events-reject-unfulfillable.e2e-spec.ts::is refused to %s (403)`<br>UI: `frontend/src/features/events/components/reject-unfulfillable.test.tsx::US-47 AC-1/AC-2: rejects from the event page with a reason and a comment` |

### TC-S3-108

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-108 |
| Story/AC ref | Story 47 AC-2 |
| Test Scenario | Select a rejection reason (no suitable venue, no available equipment, or both) and add a comment |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-107-setup.sql on testDB (reset before test). "gala" (`EVT-238`, PLANNING) is Cody's (coord.a@example.com), with a pending hold on hallA, hallB approved, a rejected hallC request, and 3 projectors approved plus 1 requested. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody rejects with each reason and a comment. |
| Test Data | "Tried everything." |
| Expected Result | Each category is recorded with the comment. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | "No suitable venue: …", "No available equipment: …", "No suitable venue or available equipment: …" stored and returned. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-reject-unfulfillable.e2e-spec.ts::records %s`<br>Unit: `src/events/events-unfulfillable.spec.ts::US-47 reject unfulfillable request US-47 AC-2: a reason category and a comment`<br>UI: `frontend/src/features/events/components/reject-unfulfillable.test.tsx::US-47 AC-1/AC-2: rejects from the event page with a reason and a comment` |

### TC-S3-109

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-109 |
| Story/AC ref | Story 47 AC-3 |
| Test Scenario | The rejection cannot be submitted without a reason |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-107-setup.sql on testDB (reset before test). "gala" (`EVT-238`, PLANNING) is Cody's (coord.a@example.com), with a pending hold on hallA, hallB approved, a rejected hallC request, and 3 projectors approved plus 1 requested. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody submits with no reason, an unknown reason, no comment, and a blank comment. |
| Test Data | — |
| Expected Result | Refused; nothing changes or is released. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | 400 each time ("a reason is required" / "a comment is required to reject this request"); still PLANNING; nothing released. |
| Status | Pass |
| Remarks | The comment is also required. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-reject-unfulfillable.e2e-spec.ts::400s with %s, and changes and releases nothing`<br>Unit: `src/events/events-unfulfillable.spec.ts::US-47 reject unfulfillable request US-47 AC-3: cannot be submitted without a reason`<br>UI: `frontend/src/features/events/components/reject-unfulfillable.test.tsx::US-47 AC-3: cannot be submitted without a reason, or without a comment` |

### TC-S3-110

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-110 |
| Story/AC ref | Story 47 AC-4 |
| Test Scenario | The event status changes to Rejected automatically |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-107-setup.sql on testDB (reset before test). "gala" (`EVT-238`, PLANNING) is Cody's (coord.a@example.com), with a pending hold on hallA, hallB approved, a rejected hallC request, and 3 projectors approved plus 1 requested. Logged in as coord.a@example.com. For other statuses, + tc-s3-107b-setup.sql. |
| Test Steps | 1. Cody rejects "gala".<br>2. He tries events in each other status. |
| Test Data | — |
| Expected Result | "gala" becomes Rejected and nothing else changes; events outside planning are refused. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | REJECTED with only the status and reason changed; allowed from APPROVED and AWAITING_ARRANGEMENTS; 409 from SUBMITTED, UNDER_REVIEW, CONFIRMED, COMPLETED, CANCELLED and REJECTED. The review rejection (US-08) still refuses an event in planning. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-reject-unfulfillable.e2e-spec.ts::rejects the event and stores the reason and comment`<br>Integration: `test/events-reject-unfulfillable.e2e-spec.ts::changes nothing else about the event`<br>Integration: `test/events-reject-unfulfillable.e2e-spec.ts::is allowed from %s too`<br>Integration: `test/events-reject-unfulfillable.e2e-spec.ts::is refused from %s (409), changing nothing`<br>Integration: `test/events-reject-unfulfillable.e2e-spec.ts::leaves US-08's review rejection as it was: refused for an event being arranged`<br>Unit: `src/events/events-unfulfillable.spec.ts::US-47 reject unfulfillable request US-47 AC-4: which statuses may be rejected as unfulfillable` |

### TC-S3-111

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-111 |
| Story/AC ref | Story 47 AC-5 |
| Test Scenario | Tentative venue holds and equipment reservations for the event are released on rejection |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-107-setup.sql on testDB (reset before test). "gala" (`EVT-238`, PLANNING) is Cody's (coord.a@example.com), with a pending hold on hallA, hallB approved, a rejected hallC request, and 3 projectors approved plus 1 requested. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody rejects "gala".<br>2. Read its bookings, reservations, equipment availability, and book hallB for "next". |
| Test Data | — |
| Expected Result | Holds, bookings and reservations are released (records kept); other events untouched. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | hallA and hallB RELEASED with `releasedAt`, hallC still REJECTED; both reservations RELEASED; projectors 1 → 4 available; hallB booked for "next" (201); the bystander's booking and reservation unchanged. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-reject-unfulfillable.e2e-spec.ts::releases the event's pending and approved bookings, keeping them linked`<br>Integration: `test/events-reject-unfulfillable.e2e-spec.ts::releases its equipment reservations through the US-33 release`<br>Integration: `test/events-reject-unfulfillable.e2e-spec.ts::makes the equipment available again in availability checks`<br>Integration: `test/events-reject-unfulfillable.e2e-spec.ts::frees the venue: the approved slot can be booked by another event`<br>Integration: `test/events-reject-unfulfillable.e2e-spec.ts::never touches another event's bookings or reservations`<br>UI: `frontend/src/features/events/components/reject-unfulfillable.test.tsx::US-47 AC-5: warns that bookings and reservations will be released` |

### TC-S3-112

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-112 |
| Story/AC ref | Story 47 AC-6 |
| Test Scenario | The Organiser is notified of the rejection and the reason |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-107-setup.sql on testDB (reset before test). "gala" (`EVT-238`, PLANNING) is Cody's (coord.a@example.com), with a pending hold on hallA, hallB approved, a rejected hallC request, and 3 projectors approved plus 1 requested. Logged in as coord.a@example.com. Logged in as organiser@example.com to read the request. |
| Test Steps | 1. Cody rejects with NO_VENUE_OR_EQUIPMENT, "Nothing fits 120 people.".<br>2. Olivia opens her request. |
| Test Data | — |
| Expected Result | Olivia is notified with the reason and comment, and sees them on her request. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | One `EVENT_STATUS_CHANGED` to Olivia: "…rejected because it cannot be fulfilled. Reason: No suitable venue or available equipment: Nothing fits 120 people."; her request showed REJECTED with the reason. |
| Status | Pass |
| Remarks | Cody also gets the equipment-released notice (US-67), which is separate. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-reject-unfulfillable.e2e-spec.ts::notifies the Organiser, and only them`<br>Integration: `test/events-reject-unfulfillable.e2e-spec.ts::shows the Organiser the rejection and its reason on their request` |

**Story 47 AC ↔ code notes**
- No mismatches. AC-3: a comment is required as well as the reason category.

## Story 48 Re-check Arrangements After Change Approval (Event Coordinator)

### TC-S3-113

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-113 |
| Story/AC ref | Story 48 AC-1 |
| Test Scenario | Opening a pending change request shows an automatic check of the bookings and reservations against the proposed details, and the check changes nothing |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-113-setup.sql + tc-s3-113b-setup.sql on testDB (reset before test). "conf" (`EVT-249`, CONFIRMED, 1 Oct 2030 01:00–05:00 UTC) is Cody's (coord.a@example.com), with mainHall approved (30/45 min buffers) and 4 projectors reserved; its pending change request moves it to 2 Oct. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody opens the pending change request.<br>2. Casey (another Coordinator) and other roles try to open it. |
| Test Data | — |
| Expected Result | The review includes the check; nothing is written. Only the event's Coordinator can see it. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The review returned the check (venue and equipment items, summary, what would move); bookings, reservations and the request were unchanged. Casey got 404; other roles 403. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-change-request-check.e2e-spec.ts::returns the check with the review, writing nothing`<br>Integration: `test/events-change-request-check.e2e-spec.ts::another Coordinator can neither see the check nor decide (404)`<br>Integration: `test/events-change-request-check.e2e-spec.ts::is refused to %s (403)`<br>UI: `frontend/src/features/events/components/arrangement-check.test.tsx::US-48 AC-1: shows the check when a pending request is opened` |

### TC-S3-114

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-114 |
| Story/AC ref | Story 48 AC-2 |
| Test Scenario | Each booked venue is checked for the proposed date and time and for capacity; a capacity shortfall alone is only a warning |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-113-setup.sql + tc-s3-113b-setup.sql on testDB (reset before test). Per step, also: tc-s3-114-setup.sql, tc-s3-114c-setup.sql, tc-s3-114d-setup.sql, tc-s3-114b-setup.sql, tc-s3-114e-setup.sql. "conf" (`EVT-249`, CONFIRMED, 1 Oct 2030 01:00–05:00 UTC) is Cody's (coord.a@example.com), with mainHall approved (30/45 min buffers) and 4 projectors reserved; its pending change request moves it to 2 Oct. Logged in as coord.a@example.com. Clashes for the new time come from + tc-s3-114-setup.sql (a rival booking), 114c/114d (setup-time clash, a block) and 114b/114e (attendance 250, a second venue). |
| Test Steps | 1. Open the request with mainHall free at the new time.<br>2. Repeat with a rival booking, a clash only in the setup/turnaround window, and a block.<br>3. Open a request raising attendance to 250.<br>4. Open one for an event with two venues. |
| Test Data | Attendance 250 against mainHall's 200 |
| Expected Result | Free → works; clash, buffer clash and block → conflict with a reason; capacity → warning only; each venue on its own. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | mainHall reported OK when free; BOOKING conflicts for the rival and for the buffer-only clash; UNAVAILABLE for the block; the 250 request gave a capacity warning and still approved (200); two venues were reported independently. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-change-request-check.e2e-spec.ts::reports a venue still free at the new time as working`<br>Integration: `test/events-change-request-check.e2e-spec.ts::reports a clash with another event’s booking at the new time`<br>Integration: `test/events-change-request-check.e2e-spec.ts::reports a clash that exists only through setup or turnaround time`<br>Integration: `test/events-change-request-check.e2e-spec.ts::reports a venue blocked out as unavailable at the new time`<br>Integration: `test/events-change-request-check.e2e-spec.ts::warns — and still approves — when capacity is below the new attendance`<br>Integration: `test/events-change-request-check.e2e-spec.ts::checks several venues independently`<br>UI: `frontend/src/features/events/components/arrangement-check.test.tsx::US-48 AC-2/AC-4: lists each conflict with its reason`<br>UI: `frontend/src/features/events/components/arrangement-check.test.tsx::US-48 AC-5b: a capacity shortfall alone warns but keeps Approve enabled` |

### TC-S3-115

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-115 |
| Story/AC ref | Story 48 AC-3 |
| Test Scenario | Each item on the proposed equipment list is checked for the requested quantity at the proposed time |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-113-setup.sql + tc-s3-113b-setup.sql on testDB (reset before test). Per step, also: tc-s3-115-setup.sql, tc-s3-115d-setup.sql, tc-s3-115b-setup.sql, tc-s3-115c-setup.sql. "conf" (`EVT-249`, CONFIRMED, 1 Oct 2030 01:00–05:00 UTC) is Cody's (coord.a@example.com), with mainHall approved (30/45 min buffers) and 4 projectors reserved; its pending change request moves it to 2 Oct. Logged in as coord.a@example.com. Equipment variants come from + tc-s3-115-setup.sql (8 microphones), 115b (the broken camera), 115c (6 projectors) and 115d (another event holds microphones). |
| Test Steps | 1. Open requests asking for microphones, the broken camera and 6 projectors.<br>2. Repeat with microphones held by another event. |
| Test Data | — |
| Expected Result | Available items pass; a shortage or a non-operational item is a conflict; the event's own reservation is not counted against it. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Microphones OK; SHORT when another event held them; the OUT_OF_SERVICE camera UNAVAILABLE; 6 projectors OK because conf's own 4 were not counted. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-change-request-check.e2e-spec.ts::reports equipment that is available`<br>Integration: `test/events-change-request-check.e2e-spec.ts::reports equipment short because another event holds it`<br>Integration: `test/events-change-request-check.e2e-spec.ts::reports a non-operational item as unavailable`<br>Integration: `test/events-change-request-check.e2e-spec.ts::never counts this event's own reservation against itself` |

### TC-S3-116

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-116 |
| Story/AC ref | Story 48 AC-4 |
| Test Scenario | A summary lists the arrangements that still work and those that would conflict, each conflict with its reason |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-113-setup.sql + tc-s3-113b-setup.sql on testDB (reset before test). Per step, also: tc-s3-114e-setup.sql, tc-s3-116-setup.sql. "conf" (`EVT-249`, CONFIRMED, 1 Oct 2030 01:00–05:00 UTC) is Cody's (coord.a@example.com), with mainHall approved (30/45 min buffers) and 4 projectors reserved; its pending change request moves it to 2 Oct. Logged in as coord.a@example.com. + tc-s3-114e-setup.sql + tc-s3-116-setup.sql (a second venue that clashes, and 2 microphones). |
| Test Steps | 1. Cody opens a request where one venue clashes and the rest works. |
| Test Data | — |
| Expected Result | Working and conflicting arrangements are listed separately, each conflict with its reason. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The summary listed the free venue and the equipment as working and the clashing venue as a conflict with its reason. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-change-request-check.e2e-spec.ts::lists the valid and the conflicting arrangements`<br>UI: `frontend/src/features/events/components/arrangement-check.test.tsx::US-48 AC-4: says everything still works, and lists it`<br>UI: `frontend/src/features/events/components/arrangement-check.test.tsx::US-48 AC-2/AC-4: lists each conflict with its reason` |

### TC-S3-117

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-117 |
| Story/AC ref | Story 48 AC-5 |
| Test Scenario | The Coordinator can reject the change request with a reason; the event and its bookings stay unchanged |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-113-setup.sql + tc-s3-113b-setup.sql on testDB (reset before test). "conf" (`EVT-249`, CONFIRMED, 1 Oct 2030 01:00–05:00 UTC) is Cody's (coord.a@example.com), with mainHall approved (30/45 min buffers) and 4 projectors reserved; its pending change request moves it to 2 Oct. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody rejects without a reason.<br>2. Cody rejects with "Hall unavailable". |
| Test Data | — |
| Expected Result | No reason → refused. With a reason → rejected; event, bookings and reservations unchanged; the Organiser is told why. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | No reason → 400. With a reason → REJECTED with the reason; event, booking and reservation unchanged; Olivia notified with the reason. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-change-request-check.e2e-spec.ts::rejects, changes nothing else, and tells the Organiser why`<br>Integration: `test/events-change-request-check.e2e-spec.ts::still requires a reason`<br>UI: `frontend/src/features/events/components/arrangement-check.test.tsx::US-48 AC-5a: Reject stays enabled and still requires a reason` |

### TC-S3-118

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-118 |
| Story/AC ref | Story 48 AC-6 |
| Test Scenario | Before approving, the Coordinator sees which bookings and reservations will be moved |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-113-setup.sql + tc-s3-113b-setup.sql on testDB (reset before test). "conf" (`EVT-249`, CONFIRMED, 1 Oct 2030 01:00–05:00 UTC) is Cody's (coord.a@example.com), with mainHall approved (30/45 min buffers) and 4 projectors reserved; its pending change request moves it to 2 Oct. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody opens the request. |
| Test Data | — |
| Expected Result | The review lists each booking and reservation that approval would move. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The preview listed mainHall's booking and the projector reservation with their new times. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-change-request-check.e2e-spec.ts::lists each venue booking and reservation that approval would rebook`<br>UI: `frontend/src/features/events/components/arrangement-check.test.tsx::US-48 AC-6: shows what approval would move to the new details`<br>UI: `frontend/src/features/events/components/arrangement-check.test.tsx::US-48 AC-5c: no conflicts — Approve enabled, with the preview of what moves` |

### TC-S3-119

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-119 |
| Story/AC ref | Story 48 AC-7 |
| Test Scenario | Approving re-runs the check, updates the event, rebooks every booking and reservation, releases the originals, all or nothing, and records the move |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-113-setup.sql + tc-s3-113b-setup.sql on testDB (reset before test). Per step, also: tc-s3-119-setup.sql, tc-s3-119b-setup.sql, tc-s3-119c-setup.sql. "conf" (`EVT-249`, CONFIRMED, 1 Oct 2030 01:00–05:00 UTC) is Cody's (coord.a@example.com), with mainHall approved (30/45 min buffers) and 4 projectors reserved; its pending change request moves it to 2 Oct. Logged in as coord.a@example.com. Variants: + tc-s3-119-setup.sql (attendance 120), 119b (attendance only), 119c (an event with nothing booked). |
| Test Steps | 1. Cody approves the request.<br>2. Approve an attendance-only change and one for an event with nothing booked.<br>3. Make the rebook fail halfway. |
| Test Data | — |
| Expected Result | Everything moves, the originals are released and linked, the change history records it; a failure changes nothing. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Event moved to 2 Oct; new booking and reservation approved, originals RELEASED and linked; nothing left approved at the old time; change history recorded the move. Attendance-only rebooked nothing; an empty event approved; a forced failure rolled back and left the request PENDING. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-change-request-check.e2e-spec.ts::moves everything to the new details, keeps the originals linked, and records it`<br>Integration: `test/events-change-request-check.e2e-spec.ts::frees the old time: no approved booking is left there`<br>Integration: `test/events-change-request-check.e2e-spec.ts::rebooks reservations even when the request does not change the equipment list`<br>Integration: `test/events-change-request-check.e2e-spec.ts::an attendance-only change rebooks nothing; only the capacity warning applies`<br>Integration: `test/events-change-request-check.e2e-spec.ts::an event with no bookings or reservations is approved without error`<br>Integration: `test/events-change-request-check.e2e-spec.ts::a failure halfway rolls everything back and leaves the request pending` |

### TC-S3-120

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-120 |
| Story/AC ref | Story 48 AC-8 |
| Test Scenario | If the check fails when approving, nothing changes, the request stays Pending and the conflicts are shown |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-113-setup.sql + tc-s3-113b-setup.sql on testDB (reset before test). Per step, also: tc-s3-114-setup.sql, tc-s3-120b-setup.sql, tc-s3-120c-setup.sql, tc-s3-120-setup.sql. "conf" (`EVT-249`, CONFIRMED, 1 Oct 2030 01:00–05:00 UTC) is Cody's (coord.a@example.com), with mainHall approved (30/45 min buffers) and 4 projectors reserved; its pending change request moves it to 2 Oct. Logged in as coord.a@example.com. + tc-s3-114-setup.sql (a rival booking taken after the request was opened), + tc-s3-120-setup.sql / 120b (equipment conflicts). |
| Test Steps | 1. Cody opens the request; a rival then books mainHall at the new time.<br>2. Cody approves.<br>3. Approve directly without opening; then reject. |
| Test Data | — |
| Expected Result | Approval refused with the conflicts; nothing changed; request still Pending; it can still be rejected. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | 409 with every venue and equipment conflict; event, bookings and reservations unchanged; request PENDING; a reject afterwards worked. Capacity alone never refused approval. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-change-request-check.e2e-spec.ts::stale page: a booking taken after the request was opened refuses the approval with 409`<br>Integration: `test/events-change-request-check.e2e-spec.ts::a direct approve call with a conflict, without ever opening the request, is refused the same way`<br>Integration: `test/events-change-request-check.e2e-spec.ts::lists every conflict — venue and equipment together`<br>Integration: `test/events-change-request-check.e2e-spec.ts::re-checking after the conflict clears shows it can go ahead, and approval then succeeds`<br>Integration: `test/events-change-request-check.e2e-spec.ts::after a refused approval the Coordinator can still reject, leaving everything unchanged`<br>Integration: `test/events-change-request-check.e2e-spec.ts::a capacity shortfall alone never refuses the approval`<br>UI: `frontend/src/features/events/components/arrangement-check.test.tsx::US-48 AC-8: a stale page — the server refuses, the page refreshes and Approve is disabled` |

### TC-S3-121

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-121 |
| Story/AC ref | Story 48 AC-9 |
| Test Scenario | The Coordinator can re-run the check without leaving the page |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-113-setup.sql + tc-s3-113b-setup.sql on testDB (reset before test). Per step, also: tc-s3-114-setup.sql, tc-s3-120c-setup.sql. "conf" (`EVT-249`, CONFIRMED, 1 Oct 2030 01:00–05:00 UTC) is Cody's (coord.a@example.com), with mainHall approved (30/45 min buffers) and 4 projectors reserved; its pending change request moves it to 2 Oct. Logged in as coord.a@example.com. + tc-s3-114-setup.sql, then tc-s3-120c-setup.sql (the rival booking released mid-test). |
| Test Steps | 1. Open the request while the rival clashes.<br>2. The rival booking is released.<br>3. Re-check, then approve. |
| Test Data | — |
| Expected Result | The re-check shows it can now go ahead, and approval succeeds. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | First check: conflict; after the release the re-check was clear and approval returned 200. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-change-request-check.e2e-spec.ts::re-checking after the conflict clears shows it can go ahead, and approval then succeeds`<br>UI: `frontend/src/features/events/components/arrangement-check.test.tsx::US-48: Re-check runs the check again and refreshes the button state`<br>UI: `frontend/src/features/events/components/arrangement-check.test.tsx::US-48: returning to the page re-runs the check` |

### TC-S3-122

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-122 |
| Story/AC ref | Story 48 AC-10 |
| Test Scenario | Approve is disabled while the check finds a venue or equipment conflict, with a message listing every conflict; a capacity shortfall alone does not disable it |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-113-setup.sql + tc-s3-113b-setup.sql on testDB (reset before test). Per step, also: tc-s3-114-setup.sql, tc-s3-120b-setup.sql, tc-s3-120-setup.sql. "conf" (`EVT-249`, CONFIRMED, 1 Oct 2030 01:00–05:00 UTC) is Cody's (coord.a@example.com), with mainHall approved (30/45 min buffers) and 4 projectors reserved; its pending change request moves it to 2 Oct. Logged in as coord.a@example.com. + tc-s3-114-setup.sql, tc-s3-120-setup.sql / 120b. |
| Test Steps | 1. Open requests with a venue conflict, an equipment conflict, both, and a capacity shortfall only. |
| Test Data | — |
| Expected Result | Approve disabled with every conflict listed for the first three; enabled for the capacity shortfall. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The server refused approval in every conflict case and listed them all; the page disabled Approve with the full list; capacity alone left it enabled. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-change-request-check.e2e-spec.ts::stale page: a booking taken after the request was opened refuses the approval with 409`<br>Integration: `test/events-change-request-check.e2e-spec.ts::a direct approve call with a conflict, without ever opening the request, is refused the same way`<br>Integration: `test/events-change-request-check.e2e-spec.ts::lists every conflict — venue and equipment together`<br>Integration: `test/events-change-request-check.e2e-spec.ts::after a refused approval the Coordinator can still reject, leaving everything unchanged`<br>Integration: `test/events-change-request-check.e2e-spec.ts::a capacity shortfall alone never refuses the approval`<br>UI: `frontend/src/features/events/components/arrangement-check.test.tsx::US-48 AC-5a: disables Approve for %s, listing every conflict and its reason next to it`<br>UI: `frontend/src/features/events/components/arrangement-check.test.tsx::US-48 AC-5b: a capacity shortfall alone warns but keeps Approve enabled` |

### TC-S3-123

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-123 |
| Story/AC ref | Story 48 AC-11 |
| Test Scenario | The Organiser is notified of the outcome, with the reason when rejected |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-113-setup.sql + tc-s3-113b-setup.sql on testDB (reset before test). Per step, also: tc-s3-114-setup.sql. "conf" (`EVT-249`, CONFIRMED, 1 Oct 2030 01:00–05:00 UTC) is Cody's (coord.a@example.com), with mainHall approved (30/45 min buffers) and 4 projectors reserved; its pending change request moves it to 2 Oct. Logged in as coord.a@example.com. + tc-s3-114-setup.sql. Logged in as organiser@example.com to read notifications. |
| Test Steps | 1. Cody approves a request; Olivia reads her notifications.<br>2. An approval is refused. |
| Test Data | — |
| Expected Result | Olivia is told of the approval (and of a rejection with its reason, TC-S3-117); a refused approval notifies no one. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | One notice to Olivia on approval; none after the refused approval. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-change-request-check.e2e-spec.ts::on approval`<br>Integration: `test/events-change-request-check.e2e-spec.ts::not on a refused approval — nothing was decided` |

**Story 48 AC ↔ code notes**
- The integration file labels its ACs differently: its AC-8 covers this card's AC-8 and AC-10, its AC-9 is AC-11. The tags use the card's numbers.
- AC-2: a capacity shortfall is a warning and never blocks approval, as the card says.

## Story 49 Configure Venue Setup and Turnaround Time (Venue Staff)

### TC-S3-124

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-124 |
| Story/AC ref | Story 49 AC-1 |
| Test Scenario | Each venue has a setup and a turnaround time in minutes, editable from the venue's details |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-124-setup.sql on testDB (reset before test). Per step, also: tc-s3-124b-setup.sql. "Sandbox Auditorium" (`VEN-065`) is Vera's (venue.staff@example.com), saved without buffer values. Vince (venue.staff2@example.com) manages no venue. Logged in as venue.staff@example.com. |
| Test Steps | 1. Vera saves setup and turnaround values (0, 30, 480).<br>2. Saves on a draft venue.<br>3. Uses the general venue edit. |
| Test Data | 0, 30, 480 |
| Expected Result | Values are saved; drafts can be configured; the general edit does not change them. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Each value saved (200) and read back; the draft venue saved too; the general edit left buffers unchanged. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/venue-buffers.e2e-spec.ts::US-49: accepts %p minutes and saves it`<br>Integration: `test/venue-buffers.e2e-spec.ts::US-49: the venue detail response includes the saved values`<br>Integration: `test/venue-buffers.e2e-spec.ts::US-49: a draft venue can be configured too`<br>Integration: `test/venue-buffers.e2e-spec.ts::US-49: the general venue edit does not change buffers (one write path)`<br>UI: `frontend/src/features/venues/components/venue-buffers-card.test.tsx::US-49 AC-1: the manager saves new values and sees a success toast` |

### TC-S3-125

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-125 |
| Story/AC ref | Story 49 AC-2 |
| Test Scenario | Existing venues default to 0 minutes for both |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-124-setup.sql on testDB (reset before test). "Sandbox Auditorium" (`VEN-065`) is Vera's (venue.staff@example.com), saved without buffer values. Vince (venue.staff2@example.com) manages no venue. Logged in as venue.staff@example.com. |
| Test Steps | 1. Read the Sandbox Auditorium. |
| Test Data | — |
| Expected Result | Setup 0 and turnaround 0. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Setup 0, turnaround 0. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/venue-buffers.e2e-spec.ts::US-49: a venue saved without buffers has 0 setup and 0 turnaround` |

### TC-S3-126

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-126 |
| Story/AC ref | Story 49 AC-3 |
| Test Scenario | Only whole numbers from 0 to 480 are accepted; anything else shows an error |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-124-setup.sql on testDB (reset before test). Per step, also: tc-s3-126-setup.sql. "Sandbox Auditorium" (`VEN-065`) is Vera's (venue.staff@example.com), saved without buffer values. Vince (venue.staff2@example.com) manages no venue. Logged in as venue.staff@example.com. |
| Test Steps | 1. Vera saves each invalid value on a venue with 10-minute buffers (+ tc-s3-126-setup.sql). |
| Test Data | -1, 481, 1.5, "abc", a missing setup or turnaround value, an empty body |
| Expected Result | Each is refused with an error; nothing is saved. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Each returned 400 with the validation messages; the stored values stayed 10/10. The form showed an inline error and sent nothing. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/venue-buffers.e2e-spec.ts::US-49: rejects %s with 400 and saves nothing`<br>UI: `frontend/src/features/venues/components/venue-buffers-card.test.tsx::US-49 AC-3: %p shows an inline error and sends nothing` |

### TC-S3-127

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-127 |
| Story/AC ref | Story 49 AC-4 |
| Test Scenario | Only Venue Staff who manage the venue can edit these values |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-124-setup.sql on testDB (reset before test). "Sandbox Auditorium" (`VEN-065`) is Vera's (venue.staff@example.com), saved without buffer values. Vince (venue.staff2@example.com) manages no venue. Logged in as venue.staff@example.com. |
| Test Steps | 1. Vince saves buffers on Vera's venue.<br>2. Other roles try.<br>3. No login. |
| Test Data | — |
| Expected Result | Refused; nothing saved. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Vince 404; other roles 403; no token 401; values unchanged. The edit form is hidden from anyone but the manager. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/venue-buffers.e2e-spec.ts::US-49: other Venue Staff get 404 (not 403, so the venue is not confirmed to exist) and nothing is saved`<br>Integration: `test/venue-buffers.e2e-spec.ts::US-49: %s gets 403 and nothing is saved`<br>Integration: `test/venue-buffers.e2e-spec.ts::US-49: an unauthenticated request gets 401`<br>UI: `frontend/src/features/venues/components/venue-buffers-card.test.tsx::US-49 AC-4: hides the edit form from anyone but the managing Venue Staff` |

### TC-S3-128

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-128 |
| Story/AC ref | Story 49 AC-5 |
| Test Scenario | Saved values are shown on the venue's details page |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-124-setup.sql on testDB (reset before test). Per step, also: tc-s3-124b-setup.sql. "Sandbox Auditorium" (`VEN-065`) is Vera's (venue.staff@example.com), saved without buffer values. Vince (venue.staff2@example.com) manages no venue. Logged in as venue.staff@example.com. |
| Test Steps | 1. Vera saves 30/45.<br>2. Reads the venue. |
| Test Data | 30, 45 |
| Expected Result | The details show 30 and 45. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | The venue detail response returned setup 30 and turnaround 45; the card showed them. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/venue-buffers.e2e-spec.ts::US-49: accepts %p minutes and saves it`<br>Integration: `test/venue-buffers.e2e-spec.ts::US-49: the venue detail response includes the saved values`<br>Integration: `test/venue-buffers.e2e-spec.ts::US-49: a draft venue can be configured too`<br>Integration: `test/venue-buffers.e2e-spec.ts::US-49: the general venue edit does not change buffers (one write path)`<br>UI: `frontend/src/features/venues/components/venue-buffers-card.test.tsx::US-49 AC-5: shows the saved values` |

### TC-S3-129

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-129 |
| Story/AC ref | Story 49 AC-6 |
| Test Scenario | Saved values are used by availability and conflict checks |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-124-setup.sql on testDB (reset before test). Per step, also: tc-s3-129-setup.sql. "Sandbox Auditorium" (`VEN-065`) is Vera's (venue.staff@example.com), saved without buffer values. Vince (venue.staff2@example.com) manages no venue. Logged in as venue.staff@example.com. + tc-s3-129-setup.sql (a Seminar booked 09:30–12:45). |
| Test Steps | 1. Check two padded windows that only touch.<br>2. Check two that share a minute. |
| Test Data | — |
| Expected Result | Touching windows do not clash; sharing a minute does. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Touching: no conflict; one shared minute: conflict. |
| Status | Pass |
| Remarks | Availability and conflict checks with buffers are tested in full under Story 50. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/venue-buffers.e2e-spec.ts::US-49: two padded windows that only touch at a boundary do not overlap`<br>Integration: `test/venue-buffers.e2e-spec.ts::US-49: padded windows that share even a minute do overlap` |

**Story 49 AC ↔ code notes**
- AC-1 and AC-5 share tests (save, then read back).
- AC-6 is covered in full by Story 50.

## Story 50 Buffer-Aware Availability Checks (Event Coordinator)

### TC-S3-130

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-130 |
| Story/AC ref | Story 50 AC-1 |
| Test Scenario | Availability blocks the setup time before and the turnaround time after each booking |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-130-setup.sql on testDB (reset before test). Per step, also: tc-s3-130c-setup.sql, tc-s3-130d-setup.sql, tc-s3-130k-setup.sql, tc-s3-130g-setup.sql. hall (`VEN-068`, setup 30, turnaround 45 min) and plain (`VEN-069`, no buffers) are Vera's; "existing" and "newEvent" are Cody's events in planning. Logged in as coord.a@example.com (requests) and venue.staff@example.com (decisions). + tc-s3-130c/130d/130g/130k-setup.sql for the late-evening bookings. |
| Test Steps | 1. A booking at hall ends 23:30; read hall's availability for the next day.<br>2. The same booking at plain. |
| Test Data | — |
| Expected Result | hall's next day shows booked (turnaround runs past midnight); plain's stays free. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | hall: next day "booked"; plain: "free". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/venues-buffers.e2e-spec.ts::marks the next day booked when a booking's turnaround runs past midnight`<br>Integration: `test/venues-buffers.e2e-spec.ts::the same booking at a venue without buffers leaves the next day free`<br>Integration: `test/venues-buffers.e2e-spec.ts::AC-1: the 60 min turnaround past midnight marks the next day booked` |

### TC-S3-131

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-131 |
| Story/AC ref | Story 50 AC-2 |
| Test Scenario | A request that overlaps another booking's setup or turnaround window is flagged as a conflict |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-130-setup.sql on testDB (reset before test). Per step, also: tc-s3-131-setup.sql, tc-s3-131b-setup.sql, tc-s3-131c-setup.sql, tc-s3-130e-setup.sql, tc-s3-130f-setup.sql, tc-s3-133-setup.sql, tc-s3-130g-setup.sql, tc-s3-130h-setup.sql. hall (`VEN-068`, setup 30, turnaround 45 min) and plain (`VEN-069`, no buffers) are Vera's; "existing" and "newEvent" are Cody's events in planning. Logged in as coord.a@example.com (requests) and venue.staff@example.com (decisions). + tc-s3-131-setup.sql (existing 10:00–12:00 at hall) and variants (131b, 131c block, 130e/130f/133). |
| Test Steps | 1. Request hall 12:00–12:45, then 09:30–10:00.<br>2. Request a window that only touches.<br>3. Approve a pending request that clashes once buffers count.<br>4. Check blocks, suggestions (US-41) and unavailability (US-52). |
| Test Data | — |
| Expected Result | Overlap with setup or turnaround → conflict; touching → allowed. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Both buffer overlaps 409; touching 201; approval of a buffer clash 409; Venue Staff saw it as a hard conflict; a block inside the request's own buffers counted; existing bookings untouched; US-41 and US-52 honour buffers. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/venues-buffers.e2e-spec.ts::refuses a request that only overlaps the existing booking's turnaround (12:00–12:45)`<br>Integration: `test/venues-buffers.e2e-spec.ts::refuses a request that only overlaps the existing booking's setup (09:30–10:00)`<br>Integration: `test/venues-buffers.e2e-spec.ts::accepts a request whose occupied window only touches the existing one`<br>Integration: `test/venues-buffers.e2e-spec.ts::refuses to approve a pending request that clashes once buffers count`<br>Integration: `test/venues-buffers.e2e-spec.ts::counts a blocked-out period inside the request's own buffers`<br>Integration: `test/venues-buffers.e2e-spec.ts::reports the buffer clash to Venue Staff as a hard conflict`<br>Integration: `test/venues-buffers.e2e-spec.ts::leaves bookings that clash under new buffers exactly as they were`<br>Integration: `test/venues-buffers.e2e-spec.ts::US-41: does not propose, and refuses to suggest, a venue blocked only by buffer time`<br>Integration: `test/venues-buffers.e2e-spec.ts::US-52: a venue unavailable during only a booking's turnaround affects that booking`<br>Integration: `test/venues-buffers.e2e-spec.ts::US-52: the same period does not affect a booking at a venue without buffers`<br>Integration: `test/venues-buffers.e2e-spec.ts::AC-2: refuses 15:00–18:30, whose event time ends inside the booking’s setup (18:00–19:00)`<br>Integration: `test/venues-buffers.e2e-spec.ts::edge: refuses 15:00–18:00 — its event time only touches the setup, but its own 60 min turnaround (to 19:00) overlaps it`<br>Integration: `test/venues-buffers.e2e-spec.ts::edge: accepts 15:00–17:00 — occupied 14:00–18:00, touching the booking’s setup at 18:00 is not a clash` |

### TC-S3-132

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-132 |
| Story/AC ref | Story 50 AC-3 |
| Test Scenario | Setup and turnaround buffers are shown separately from the event time on the availability calendar |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-130-setup.sql on testDB (reset before test). Per step, also: tc-s3-131-setup.sql, tc-s3-130b-setup.sql, tc-s3-130c-setup.sql. hall (`VEN-068`, setup 30, turnaround 45 min) and plain (`VEN-069`, no buffers) are Vera's; "existing" and "newEvent" are Cody's events in planning. Logged in as coord.a@example.com (requests) and venue.staff@example.com (decisions). + tc-s3-131-setup.sql. |
| Test Steps | 1. A Coordinator reads hall's calendar segments.<br>2. Other roles try. |
| Test Data | — |
| Expected Result | Each booking shows separate setup, event and turnaround segments. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Three segments per booking; a pending request shown as tentative with nothing identifying the event; a booking whose turnaround alone reaches the range included; other roles 403. The calendar listed the three times separately. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/venues-buffers.e2e-spec.ts::returns each booking as separate setup, event and turnaround segments`<br>Integration: `test/venues-buffers.e2e-spec.ts::shows a pending request as tentative, and nothing identifying the event`<br>Integration: `test/venues-buffers.e2e-spec.ts::includes a booking whose turnaround alone reaches into the range`<br>Integration: `test/venues-buffers.e2e-spec.ts::is refused to %s, like the US-17 calendar (403)`<br>UI: `frontend/src/features/venues/components/venue-availability-calendar.test.tsx::lists a selected day’s setup, event and turnaround as separate times` |

### TC-S3-133

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-133 |
| Story/AC ref | Story 50 AC-4 |
| Test Scenario | Venues without configured setup or turnaround times fall back to zero |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-130-setup.sql on testDB (reset before test). Per step, also: tc-s3-133-setup.sql, tc-s3-130g-setup.sql, tc-s3-130j-setup.sql, tc-s3-130l-setup.sql, tc-s3-130h-setup.sql. hall (`VEN-068`, setup 30, turnaround 45 min) and plain (`VEN-069`, no buffers) are Vera's; "existing" and "newEvent" are Cody's events in planning. Logged in as coord.a@example.com (requests) and venue.staff@example.com (decisions). + tc-s3-133-setup.sql, 130j (a venue never configured), 130l (0/0). |
| Test Steps | 1. Book back-to-back at plain.<br>2. Book a real overlap there.<br>3. Repeat at a never-configured venue and one set to 0/0. |
| Test Data | — |
| Expected Result | Back-to-back allowed; real overlap refused; the same with 0/0. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Back-to-back 201; overlap 409; the unconfigured and 0/0 venues behaved the same and were listed in search. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/venues-buffers.e2e-spec.ts::allows back-to-back bookings at a venue with no buffers`<br>Integration: `test/venues-buffers.e2e-spec.ts::still refuses a real overlap there`<br>Integration: `test/venues-buffers.e2e-spec.ts::AC-4: a venue whose buffers were never configured uses the event time alone — 15:00–18:30 accepted, listed in the search`<br>Integration: `test/venues-buffers.e2e-spec.ts::AC-4 (extra): buffers explicitly set to 0 0 behave the same` |

### TC-S3-134

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-134 |
| Story/AC ref | Story 50 AC-5 |
| Test Scenario | Search and filter by date only return venues free including buffer times |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-130-setup.sql on testDB (reset before test). Per step, also: tc-s3-131-setup.sql, tc-s3-133-setup.sql, tc-s3-130b-setup.sql, tc-s3-130g-setup.sql, tc-s3-130h-setup.sql, tc-s3-130i-setup.sql. hall (`VEN-068`, setup 30, turnaround 45 min) and plain (`VEN-069`, no buffers) are Vera's; "existing" and "newEvent" are Cody's events in planning. Logged in as coord.a@example.com (requests) and venue.staff@example.com (decisions). + tc-s3-131/133/130b/130g/130h/130i-setup.sql. |
| Test Steps | 1. Search a slot blocked only by hall's buffer.<br>2. Search once the slot clears the turnaround.<br>3. Search with only a pending request there. |
| Test Data | — |
| Expected Result | hall is left out while only buffers block it, returned once clear; pending requests still ignored. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | hall excluded, then included; pending requests did not exclude it. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/venues-buffers.e2e-spec.ts::leaves out a venue blocked only by buffer time`<br>Integration: `test/venues-buffers.e2e-spec.ts::returns the venue once the slot clears its turnaround`<br>Integration: `test/venues-buffers.e2e-spec.ts::still ignores pending requests, as before`<br>Integration: `test/venues-buffers.e2e-spec.ts::AC-5: a search for 17:30–18:30 leaves the buffered venue out` |

**Story 50 AC ↔ code notes**
- No mismatches.

## Story 51 Flag Bookings That Conflict After Buffer Changes (Venue Staff)

### TC-S3-135

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-135 |
| Story/AC ref | Story 51 AC-1 |
| Test Scenario | Changing a venue's buffers re-checks all future pending, tentative and confirmed bookings for that venue |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-124-setup.sql on testDB (reset before test). Per step, also: tc-s3-136b-setup.sql, tc-s3-136c-setup.sql, tc-s3-136d-setup.sql, tc-s3-135c-setup.sql. The Sandbox Auditorium (`VEN-065`, Vera's) has two approved bookings, 10:00–12:00 and 12:30–14:00 on 1 Oct 2030, that clash only once setup 30 / turnaround 45 apply. Logged in as venue.staff@example.com. Variants: tc-s3-135c, 136b (a rejected booking), 136c (a requested one), 136d (another venue). |
| Test Steps | 1. Vera previews 30/45 with approved, requested, rejected and other-venue bookings. |
| Test Data | 30, 45 |
| Expected Result | Pending, tentative and confirmed bookings are re-checked; rejected and other venues are not. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | APPROVED and REQUESTED bookings were checked; REJECTED ignored; other venue untouched. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/booking-review-flags.e2e-spec.ts::US-51: REJECTED bookings are ignored`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: REQUESTED bookings are re-checked as well as APPROVED`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: bookings on another venue are untouched`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: %s` |

### TC-S3-136

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-136 |
| Story/AC ref | Story 51 AC-2 |
| Test Scenario | Past bookings are not re-checked |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-124-setup.sql on testDB (reset before test). Per step, also: tc-s3-136-setup.sql. The Sandbox Auditorium (`VEN-065`, Vera's) has the same clashing pair as TC-S3-137, on 1 Jan 2020 (tc-s3-136-setup.sql). Logged in as venue.staff@example.com. |
| Test Steps | 1. Vera previews 30/45. |
| Test Data | — |
| Expected Result | No clash is reported for the past pair. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | No clash listed. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/booking-review-flags.e2e-spec.ts::US-51 AC-2: past bookings are ignored` |

### TC-S3-137

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-137 |
| Story/AC ref | Story 51 AC-3 |
| Test Scenario | If bookings now overlap, Venue Staff see a list (event, time and what it clashes with) before saving, and can cancel or save anyway |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-124-setup.sql on testDB (reset before test). Per step, also: tc-s3-135-setup.sql, tc-s3-135b-setup.sql. The Sandbox Auditorium (`VEN-065`, Vera's) has two approved bookings, 10:00–12:00 and 12:30–14:00 on 1 Oct 2030, that clash only once setup 30 / turnaround 45 apply. Logged in as venue.staff@example.com. + tc-s3-135-setup.sql (+ 135b, a third booking). |
| Test Steps | 1. Vera previews 30/45.<br>2. Saves without confirming.<br>3. Cancels. |
| Test Data | 30, 45 |
| Expected Result | Both bookings are listed with what they clash with; nothing saves until confirmed. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Preview listed both with event, time and the other booking; preview saved nothing; save without confirmation 409 with the list; 0/0 and touching windows did not clash; invalid values 400; Vince 404. The card listed the clashes and Cancel saved nothing. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/booking-review-flags.e2e-spec.ts::US-51: the customer example — both bookings are listed with what they clash with`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: preview saves nothing`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: with 0/0 buffers the customer example does not clash`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: padded windows that only touch do not clash`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: preview validates like the save (whole numbers 0-480)`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51 AC-4: without confirmation, a clash is a 409 with the list, and nothing is saved`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: other Venue Staff cannot preview or save (404)`<br>UI: `frontend/src/features/venues/components/venue-buffers-card.test.tsx::US-51 AC-3: lists each clash — event, time, and what it clashes with — before saving`<br>UI: `frontend/src/features/venues/components/venue-buffers-card.test.tsx::US-51 AC-4: Cancel closes the list and saves nothing` |

### TC-S3-138

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-138 |
| Story/AC ref | Story 51 AC-4 |
| Test Scenario | Saving anyway marks the clashing bookings "Conflict – needs review" in the queue and calendar until resolved |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-124-setup.sql on testDB (reset before test). Per step, also: tc-s3-135-setup.sql, tc-s3-136c-setup.sql, tc-s3-138b-setup.sql. The Sandbox Auditorium (`VEN-065`, Vera's) has two approved bookings, 10:00–12:00 and 12:30–14:00 on 1 Oct 2030, that clash only once setup 30 / turnaround 45 apply. Logged in as venue.staff@example.com. + tc-s3-135-setup.sql (+ 136c, 138b). |
| Test Steps | 1. Vera saves anyway.<br>2. Reads the queue and calendar.<br>3. Resolves one; rejects one of a pair. |
| Test Data | — |
| Expected Result | Both are flagged in the queue and calendar until resolved; resolving clears the flag. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Both flagged (`needsReview`) in queue and calendar; manual resolve cleared the flag and wrote a decision; Vince 404 / other roles 403; an unflagged booking 409; rejecting or reversing one of a pair cleared the other; a flag that still clashes stayed. The badge read "Conflict – needs review". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/booking-review-flags.e2e-spec.ts::US-51 AC-5/AC-6: save anyway — buffers saved, both flagged, times and status unchanged`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: queue and calendar entries carry needsReview`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: manual resolve clears the flag and writes a BookingDecision`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: other Venue Staff get 404 and other roles 403; the flag stays`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: an unflagged booking cannot be resolved (409)`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: auto-clear — rejecting one booking of a clashing pair clears the other's flag`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: auto-clear — reversing an approval to rejected clears the other's flag`<br>Integration: `test/booking-review-flags.e2e-spec.ts::US-51: auto re-check keeps a flag that still clashes with something else`<br>UI: `frontend/src/features/venues/components/venue-buffers-card.test.tsx::US-51 AC-4/AC-5: Save anyway saves with confirmation and says how many were flagged`<br>UI: `frontend/src/features/bookings/components/review-flag-panel.test.tsx::US-51 AC-5: the badge reads "Conflict – needs review"`<br>UI: `frontend/src/features/bookings/components/review-flag-panel.test.tsx::US-51 AC-5: a flagged booking shows why it was flagged`<br>UI: `frontend/src/features/bookings/components/review-flag-panel.test.tsx::US-51: Mark resolved sends the optional note`<br>UI: `frontend/src/features/calendar/calendar-labels.test.tsx::US-51: the legend has a key for a conflict flag` |

### TC-S3-139

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-139 |
| Story/AC ref | Story 51 AC-5 |
| Test Scenario | Existing bookings are never cancelled automatically |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-124-setup.sql on testDB (reset before test). Per step, also: tc-s3-135-setup.sql. The Sandbox Auditorium (`VEN-065`, Vera's) has two approved bookings, 10:00–12:00 and 12:30–14:00 on 1 Oct 2030, that clash only once setup 30 / turnaround 45 apply. Logged in as venue.staff@example.com. + tc-s3-135-setup.sql. |
| Test Steps | 1. Vera saves anyway.<br>2. Read both bookings. |
| Test Data | — |
| Expected Result | Both keep their times and status. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Both still APPROVED with their times. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/booking-review-flags.e2e-spec.ts::US-51 AC-5/AC-6: save anyway — buffers saved, both flagged, times and status unchanged` |

### TC-S3-140

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-140 |
| Story/AC ref | Story 51 AC-6 |
| Test Scenario | With no clashes, the change saves with a confirmation message |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-124-setup.sql on testDB (reset before test). Per step, also: tc-s3-135-setup.sql. The Sandbox Auditorium (`VEN-065`, Vera's) has two approved bookings, 10:00–12:00 and 12:30–14:00 on 1 Oct 2030, that clash only once setup 30 / turnaround 45 apply. Logged in as venue.staff@example.com. + tc-s3-135-setup.sql. |
| Test Steps | 1. Vera saves buffers that clash with nothing. |
| Test Data | — |
| Expected Result | Saved, nothing flagged, confirmation shown. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Saved (200), nothing flagged; the card showed "Buffer times saved". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/booking-review-flags.e2e-spec.ts::US-51 AC-7: no clashes — saved, nothing flagged`<br>UI: `frontend/src/features/venues/components/venue-buffers-card.test.tsx::US-51 AC-7: no clashes saves straight away with "Buffer times saved"` |

**Story 51 AC ↔ code notes**
- The card lists "I can then cancel the change or save anyway" under AC-3; the test files number it AC-4, so their AC-5 to AC-7 are this card's AC-4 to AC-6.

## Story 52 Unavailable Venue Replacement (Event Coordinator)

### TC-S3-141

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-141 |
| Story/AC ref | Story 52 AC-1 |
| Test Scenario | The Coordinator is notified when a booked venue becomes unavailable, with the reason |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-141-setup.sql on testDB (reset before test). Per step, also: tc-s3-141b-setup.sql, tc-s3-141c-setup.sql, tc-s3-142-setup.sql, tc-s3-142b-setup.sql. "showcase" (`EVT-266`, Cody's) has mainHall (`VEN-073`, Vera's) approved for 1 Oct 2030 09:00–12:00 UTC; eastHall (`VEN-074`) is Vince's. Logged in as venue.staff@example.com, coord.a@example.com and venue.staff2@example.com. Variants: tc-s3-141b/141c (other bookings), 142 (pending), 142b (unassigned event). |
| Test Steps | 1. Vera marks mainHall unavailable over the booking.<br>2. Repeat; check other bookings and an unassigned event. |
| Test Data | Reason "Flooding" |
| Expected Result | Cody is notified with the event, venue, dates and reason; the booking is marked; nothing else changes. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Booking marked with period and reason; event and booking otherwise unchanged; pending requests marked, rejected not; others untouched; a repeat neither re-marked nor re-notified; one notice to Cody naming event, venue, dates and reason; an unassigned event notified no one. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-venue-unavailable.e2e-spec.ts::marks the overlapping booking as needing a replacement, with the period and reason`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::does not cancel the event or change its details, or the booking itself`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::affects pending requests too, but not rejected ones`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::leaves bookings outside the period, or at other venues, untouched`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::does not mark or notify twice when called again`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::names the event, the venue, the affected dates and the reason`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::notifies only the Coordinator of the affected event`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::marks an event with no assigned Coordinator without error, and notifies no one`<br>UI: `frontend/src/features/bookings/components/venue-unavailable.test.tsx::US-52 AC-1: shows the venue, the affected dates and the reason` |

### TC-S3-142

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-142 |
| Story/AC ref | Story 52 AC-2 |
| Test Scenario | The affected event is flagged "Venue unavailable" on the Coordinator's dashboard |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-141-setup.sql on testDB (reset before test). "showcase" (`EVT-266`, Cody's) has mainHall (`VEN-073`, Vera's) approved for 1 Oct 2030 09:00–12:00 UTC; eastHall (`VEN-074`) is Vince's. Logged in as venue.staff@example.com, coord.a@example.com and venue.staff2@example.com. |
| Test Steps | 1. Cody reads his affected bookings.<br>2. Casey and other roles try. |
| Test Data | — |
| Expected Result | Only the affected event is flagged, for its Coordinator. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Listed with event, venue, period and reason; empty for unaffected events; Casey saw nothing; other roles 403. The dashboard flagged only the affected event. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-venue-unavailable.e2e-spec.ts::lists the affected booking with its event, venue, period and reason`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::is empty for events that are not affected`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::is not shown to another Coordinator`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::is refused to %s (403)`<br>UI: `frontend/src/features/bookings/components/venue-unavailable.test.tsx::flags only the affected event` |

### TC-S3-143

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-143 |
| Story/AC ref | Story 52 AC-3 |
| Test Scenario | A replacement request can be submitted from the affected event with the original requirements pre-filled |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-141-setup.sql on testDB (reset before test). Per step, also: tc-s3-143b-setup.sql. "showcase" (`EVT-266`, Cody's) has mainHall (`VEN-073`, Vera's) approved for 1 Oct 2030 09:00–12:00 UTC; eastHall (`VEN-074`) is Vince's. Logged in as venue.staff@example.com, coord.a@example.com and venue.staff2@example.com. + tc-s3-143b-setup.sql (a second event of Cody's). |
| Test Steps | 1. Cody requests eastHall as a replacement.<br>2. Changes the timing; tries the unavailable venue; tries an unmarked booking. |
| Test Data | — |
| Expected Result | An ordinary pending request linked to the original, carrying its requirements. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Pending request linked to BKG-145 with its layout, accessibility and equipment; timing editable; the unavailable venue refused; unmarked or other events' bookings refused; Casey 404, other roles 403. The form was pre-filled and linked. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-venue-unavailable.e2e-spec.ts::is an ordinary pending request, linked to the original, carrying its requirements`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::can change the pre-filled timing and attendance`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::uses the same availability rules: the unavailable venue is refused for the period`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::refuses to replace a booking that was not marked, or one of another event`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::refuses another Coordinator's event (404) and other roles (403)`<br>UI: `frontend/src/features/bookings/components/venue-unavailable.test.tsx::US-52 AC-3: the replacement form is pre-filled with the original booking's details and linked to it`<br>UI: `frontend/src/features/bookings/components/venue-unavailable.test.tsx::US-52 AC-3: no replacement form when the Coordinator cannot book for the event` |

### TC-S3-144

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-144 |
| Story/AC ref | Story 52 AC-4 |
| Test Scenario | The Coordinator can view venues suggested by Venue Staff and select one |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-141-setup.sql on testDB (reset before test). "showcase" (`EVT-266`, Cody's) has mainHall (`VEN-073`, Vera's) approved for 1 Oct 2030 09:00–12:00 UTC; eastHall (`VEN-074`) is Vince's. Logged in as venue.staff@example.com, coord.a@example.com and venue.staff2@example.com. |
| Test Steps | 1. Vera suggests eastHall.<br>2. Cody selects it. |
| Test Data | — |
| Expected Result | A replacement request that still needs approval. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | A REQUESTED replacement for eastHall linked to the original. The page listed the suggestion and selecting it sent the request. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-venue-unavailable.e2e-spec.ts::creates a replacement request that still needs approval`<br>UI: `frontend/src/features/bookings/components/venue-unavailable.test.tsx::US-52 AC-4: shows the venues Venue Staff suggested and selecting one requests it` |

### TC-S3-145

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-145 |
| Story/AC ref | Story 52 AC-5 |
| Test Scenario | The original booking is released once a replacement is confirmed |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-141-setup.sql on testDB (reset before test). Per step, also: tc-s3-145-setup.sql, tc-s3-145b-setup.sql. "showcase" (`EVT-266`, Cody's) has mainHall (`VEN-073`, Vera's) approved for 1 Oct 2030 09:00–12:00 UTC; eastHall (`VEN-074`) is Vince's. Logged in as venue.staff@example.com, coord.a@example.com and venue.staff2@example.com. + tc-s3-145-setup.sql (westHall), 145b (a breakout booking). |
| Test Steps | 1. Vince approves the replacement.<br>2. Repeat while only requested, and when rejected. |
| Test Data | — |
| Expected Result | Released (record kept) only on confirmation; other bookings untouched. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Original RELEASED and linked on approval; flag cleared; kept while requested; kept with the flag after a rejection; other bookings untouched; a released booking could not be decided again; a later replacement refused. The page said it was released. |
| Status | Pass |
| Remarks | Attendees are not told of the venue change when the original is RELEASED: open bug #4, captured under TC-S3-40. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-venue-unavailable.e2e-spec.ts::releases the original on approval, keeping the record and linking it`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::clears the "Venue unavailable" flag on confirmation`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::does not release the original while the replacement is only requested`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::keeps the original and the flag when the replacement is rejected, and allows another try`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::releases only the affected booking, never the event's other bookings`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::a released booking cannot be decided on again, and frees its slot`<br>Integration: `test/bookings-venue-unavailable.e2e-spec.ts::a later replacement once one is confirmed is refused`<br>UI: `frontend/src/features/bookings/components/venue-unavailable.test.tsx::shows it was released once a replacement was confirmed, and keeps its details` |

**Story 52 AC ↔ code notes**
- AC-5: when the original is released, Attendees are not told of the venue change (open bug #4, TC-S3-40).

## Story 53 Multi-Venue Booking (Event Coordinator)

### TC-S3-146

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-146 |
| Story/AC ref | Story 53 AC-1 |
| Test Scenario | More than one venue booking request can be added to one event |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-146-setup.sql on testDB (reset before test). "Summit" (`EVT-274`, Cody's, 1 Oct 2030 09:00–17:00 UTC, 200 people) has no bookings; mainHall is Vera's, breakoutA and breakoutB are Vince's. Logged in as coord.a@example.com, venue.staff@example.com and venue.staff2@example.com. |
| Test Steps | 1. Cody requests mainHall, breakoutA and breakoutB for the Summit. |
| Test Data | — |
| Expected Result | Three bookings on one event. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Three REQUESTED bookings on `EVT-274`, one per venue. (Another Coordinator cannot add one: TC-S3-151.) |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-multi-venue.e2e-spec.ts::adds three bookings to one event with different times and requirements`<br>Integration: `test/bookings-multi-venue.e2e-spec.ts::rejects an unknown layout or accessibility value` |

### TC-S3-147

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-147 |
| Story/AC ref | Story 53 AC-2 |
| Test Scenario | Timing and requirements are set separately for each venue |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-146-setup.sql on testDB (reset before test). "Summit" (`EVT-274`, Cody's, 1 Oct 2030 09:00–17:00 UTC, 200 people) has no bookings; mainHall is Vera's, breakoutA and breakoutB are Vince's. Logged in as coord.a@example.com, venue.staff@example.com and venue.staff2@example.com. |
| Test Steps | 1. Request each venue with its own time, layout and accessibility.<br>2. Send an unknown layout. |
| Test Data | — |
| Expected Result | Each booking keeps its own values; unspecified values copy the event's; unknown values refused. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Each booking stored its own times and requirements; omitted ones copied the event's; unknown layout/accessibility 400. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-multi-venue.e2e-spec.ts::adds three bookings to one event with different times and requirements`<br>Integration: `test/bookings-multi-venue.e2e-spec.ts::rejects an unknown layout or accessibility value`<br>UI: `frontend/src/features/bookings/components/multi-venue.test.tsx::sends this venue’s own requirements when they are set`<br>UI: `frontend/src/features/bookings/components/multi-venue.test.tsx::sends no requirements — so the event’s are copied — when they are not changed` |

### TC-S3-148

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-148 |
| Story/AC ref | Story 53 AC-3 |
| Test Scenario | Each venue goes through its own availability and conflict check |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-146-setup.sql on testDB (reset before test). Per step, also: tc-s3-148-setup.sql. "Summit" (`EVT-274`, Cody's, 1 Oct 2030 09:00–17:00 UTC, 200 people) has no bookings; mainHall is Vera's, breakoutA and breakoutB are Vince's. Logged in as coord.a@example.com, venue.staff@example.com and venue.staff2@example.com. + tc-s3-148-setup.sql (another event holds breakoutA 13:00–14:00). |
| Test Steps | 1. Request all three; breakoutA clashes.<br>2. Each venue's staff decide. |
| Test Data | — |
| Expected Result | Only breakoutA is refused; the event's own bookings never clash with each other; each is decided by its own staff. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | breakoutA 409, the others 201; no self-conflict; Vera decided mainHall, Vince the breakouts (each other 404). |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-multi-venue.e2e-spec.ts::one venue's clash refuses that request only; the event's others go ahead`<br>Integration: `test/bookings-multi-venue.e2e-spec.ts::the event's own bookings at different venues never conflict with each other`<br>Integration: `test/bookings-multi-venue.e2e-spec.ts::each is decided independently by its own venue staff` |

### TC-S3-149

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-149 |
| Story/AC ref | Story 53 AC-4 |
| Test Scenario | Each venue booking's approval status is shown separately on the event |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-146-setup.sql on testDB (reset before test). "Summit" (`EVT-274`, Cody's, 1 Oct 2030 09:00–17:00 UTC, 200 people) has no bookings; mainHall is Vera's, breakoutA and breakoutB are Vince's. Logged in as coord.a@example.com, venue.staff@example.com and venue.staff2@example.com. |
| Test Steps | 1. Approve one, reject one, leave one pending.<br>2. Read the event's bookings; Casey tries. |
| Test Data | — |
| Expected Result | Each with its own status and decision. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Three entries, each with its own status and decision; Casey 404. The page showed each status separately. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-multi-venue.e2e-spec.ts::lists every booking on the event with its own status and decision`<br>Integration: `test/bookings-multi-venue.e2e-spec.ts::is not shown to another Coordinator`<br>UI: `frontend/src/features/bookings/components/multi-venue.test.tsx::shows each booking with its own status` |

### TC-S3-150

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-150 |
| Story/AC ref | Story 53 AC-5 |
| Test Scenario | The venue counts as arranged only when all required venues are approved |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-146-setup.sql on testDB (reset before test). "Summit" (`EVT-274`, Cody's, 1 Oct 2030 09:00–17:00 UTC, 200 people) has no bookings; mainHall is Vera's, breakoutA and breakoutB are Vince's. Logged in as coord.a@example.com, venue.staff@example.com and venue.staff2@example.com. |
| Test Steps | 1. Read the arrangement with none, some and all approved, then after a new request. |
| Test Data | — |
| Expected Result | Arranged only when every live booking is approved; rejected and released ones do not count. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | false → false → true → false; rejected and released bookings ignored; Casey 404, other roles 403. The page showed progress, then "Venue arranged". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-multi-venue.e2e-spec.ts::is false with no bookings, false until all approved, true after, false again on a new request`<br>Integration: `test/bookings-multi-venue.e2e-spec.ts::does not count a rejected or released booking as required`<br>Integration: `test/bookings-multi-venue.e2e-spec.ts::is refused for another Coordinator's event (404) and other roles (403)`<br>UI: `frontend/src/features/bookings/components/multi-venue.test.tsx::shows progress while some are pending`<br>UI: `frontend/src/features/bookings/components/multi-venue.test.tsx::shows "Venue arranged" once all are approved` |

### TC-S3-151

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-151 |
| Story/AC ref | Story 53 AC-6 |
| Test Scenario | One venue booking can be cancelled or released without affecting the others |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-96-setup.sql + tc-s3-146-setup.sql on testDB (reset before test). "Summit" (`EVT-274`, Cody's, 1 Oct 2030 09:00–17:00 UTC, 200 people) has no bookings; mainHall is Vera's, breakoutA and breakoutB are Vince's. Logged in as coord.a@example.com, venue.staff@example.com and venue.staff2@example.com. |
| Test Steps | 1. Release one approved booking; cancel a pending one.<br>2. Book the freed slot.<br>3. Try a rejected booking; Casey tries. |
| Test Data | — |
| Expected Result | Only that booking is released (record kept); slot freed; others and the event unchanged. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | RELEASED with record kept; others and event unchanged; pending cancelled the same way; slot rebooked; rejected/released 409; Casey 404, other roles 403; a released booking no longer needs a replacement (US-52). Release was offered only on active bookings after confirming. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/bookings-multi-venue.e2e-spec.ts::releases one approved booking, keeps its record, and leaves the others and the event alone`<br>Integration: `test/bookings-multi-venue.e2e-spec.ts::cancels a pending request the same way`<br>Integration: `test/bookings-multi-venue.e2e-spec.ts::frees the slot: the venue can be booked again for that time`<br>Integration: `test/bookings-multi-venue.e2e-spec.ts::refuses to release a rejected or already released booking`<br>Integration: `test/bookings-multi-venue.e2e-spec.ts::another Coordinator cannot release the event's booking (404); other roles get 403`<br>Integration: `test/bookings-multi-venue.e2e-spec.ts::US-52 interplay: a released booking no longer shows as needing a replacement`<br>Integration: `test/bookings-multi-venue.e2e-spec.ts::another Coordinator cannot add a booking to the event (404)`<br>UI: `frontend/src/features/bookings/components/multi-venue.test.tsx::offers release only on active bookings, and only after confirming`<br>UI: `frontend/src/features/bookings/components/multi-venue.test.tsx::offers no release where the viewer cannot release (e.g. the Organiser)` |

**Story 53 AC ↔ code notes**
- AC-1 and AC-2 share tests.

## Story 54 Place a Tentative Venue Hold with Expiry (Venue Staff)

### TC-S3-152

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-152 |
| Story/AC ref | Story 54 AC-1 |
| Test Scenario | Venue Staff place a hold on a free slot for a specific event, with an expiry date and time |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s1-96-setup.sql + tc-s3-152-setup.sql on testDB (reset before test). Per step, also: tc-s3-152c-setup.sql, tc-s3-152b-setup.sql, tc-s3-152d-setup.sql. Main Hall (`VEN-079`) is Vera's (venue.staff@example.com), East Annex (`VEN-080`) is Vince's; "Gala" (`EVT-276`, PLANNING, 1 Oct 2030 18:00–22:00 UTC) is Cody's (coord.a@example.com); Leah (lead@example.com) is the Coordinator Lead. Hold expiries in the scripts are relative to the database clock. Logged in as venue.staff@example.com. + tc-s3-152b-setup.sql (a draft), 152c (technical requirements), 152d (Main Hall back to draft). |
| Test Steps | 1. Vera lists the events she can hold for.<br>2. Holds Main Hall for the Gala, 18:00–22:00, expiring in 48 hours.<br>3. Tries a draft venue and an unknown event. |
| Test Data | Expiry: now + 48 h |
| Expected Result | The hold is placed for the event with its expiry; only bookable events are offered. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | 201 HELD for `EVT-276`, held by Vera, `holdExpiresAt` as sent, no warnings; it carried the event's technical requirements; the picker listed only the Gala with name, times, attendance and Coordinator (Vince 404); unknown event 404; draft venue 409. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: Venue Staff hold a free slot for an event, with an expiry`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::Story 20 AC-2: a hold carries the technical requirements, as a request does`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: lists the bookable events to hold for, with only the fields the picker needs`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: a draft venue cannot be held (409), nor an event that does not exist (404)` |

### TC-S3-153

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-153 |
| Story/AC ref | Story 54 AC-2 |
| Test Scenario | The expiry must be in the future and before the event starts |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s1-96-setup.sql + tc-s3-152-setup.sql on testDB (reset before test). Per step, also: tc-s3-153-setup.sql. Main Hall (`VEN-079`) is Vera's (venue.staff@example.com), East Annex (`VEN-080`) is Vince's; "Gala" (`EVT-276`, PLANNING, 1 Oct 2030 18:00–22:00 UTC) is Cody's (coord.a@example.com); Leah (lead@example.com) is the Coordinator Lead. Hold expiries in the scripts are relative to the database clock. Logged in as venue.staff@example.com. + tc-s3-153-setup.sql (a submitted event). |
| Test Steps | 1. Hold with an expiry in the past, at and after the event start, and after the held slot starts.<br>2. Coordinator and Vince try; hold for a submitted event. |
| Test Data | — |
| Expected Result | Each invalid expiry is refused; other roles and events not in planning are refused. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Past, at-start, after-start and after-slot-start expiries 400; Coordinator 403; Vince 404; submitted event 409; no booking written. The panel's expiry rules matched. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: an expiry in the past is refused (400)`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: an expiry at or after the event starts is refused (400)`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: an expiry after the held slot starts is refused, even before the event (400)`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: other roles are refused (403); Venue Staff who do not manage the venue get not found (404)`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: an event that is not at a planning stage cannot be held for (409)`<br>UI: `frontend/src/features/bookings/components/hold-panel.test.tsx::accepts an expiry in the future, before the event and the held time`<br>UI: `frontend/src/features/bookings/components/hold-panel.test.tsx::refuses a past expiry, one after the event starts, and one after the held time starts` |

### TC-S3-154

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-154 |
| Story/AC ref | Story 54 AC-3 |
| Test Scenario | While active, the hold blocks other requests for that slot, the same as a confirmed booking |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s1-96-setup.sql + tc-s3-152-setup.sql on testDB (reset before test). Per step, also: tc-s3-154-setup.sql, tc-s3-154b-setup.sql, tc-s3-154c-setup.sql, tc-s3-157b-setup.sql, tc-s3-157c-setup.sql. Main Hall (`VEN-079`) is Vera's (venue.staff@example.com), East Annex (`VEN-080`) is Vince's; "Gala" (`EVT-276`, PLANNING, 1 Oct 2030 18:00–22:00 UTC) is Cody's (coord.a@example.com); Leah (lead@example.com) is the Coordinator Lead. Hold expiries in the scripts are relative to the database clock. Logged in as venue.staff@example.com. + tc-s3-154-setup.sql ("Other", `EVT-279`), 154b (Gala approved), 154c (Gala requested), 157b/157c (a live hold and a pending request inside it). |
| Test Steps | 1. Hold the slot; Cody requests it for Other.<br>2. Hold over a hold, over an approved booking, over a pending request.<br>3. Write two overlapping held/approved rows directly. |
| Test Data | — |
| Expected Result | Requests and holds over a live hold or confirmed booking are refused; a pending request only warns; the database refuses overlaps too. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Request over the hold 409 naming the hold; hold over hold 409; hold over APPROVED 409; hold over REQUESTED 201 with an `OVERLAPS_PENDING_REQUEST` warning; direct overlapping rows rejected (23P01) and reported as 409, not 500. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: a booking request overlapping a live hold is refused (409)`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: a hold overlapping a live hold is refused (409)`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: a hold overlapping an APPROVED booking is refused (409)`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: a hold overlapping a pending request goes through with a soft warning`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: two overlapping HELD/APPROVED rows written directly are rejected (EXCLUDE, 23P01)`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: a constraint violation is reported as 409, not 500` |

### TC-S3-155

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-155 |
| Story/AC ref | Story 54 AC-4 |
| Test Scenario | The hold shows as "Tentative" on calendars, with its expiry |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s1-96-setup.sql + tc-s3-152-setup.sql on testDB (reset before test). Per step, also: tc-s3-154-setup.sql, tc-s3-155-setup.sql. Main Hall (`VEN-079`) is Vera's (venue.staff@example.com), East Annex (`VEN-080`) is Vince's; "Gala" (`EVT-276`, PLANNING, 1 Oct 2030 18:00–22:00 UTC) is Cody's (coord.a@example.com); Leah (lead@example.com) is the Coordinator Lead. Hold expiries in the scripts are relative to the database clock. Logged in as venue.staff@example.com. + tc-s3-154-setup.sql + tc-s3-155-setup.sql (a pending morning request). |
| Test Steps | 1. Hold the evening; read the calendar and Main Hall's availability. |
| Test Data | — |
| Expected Result | The hold is Tentative with its expiry; the pending request is Pending; the day shows tentative. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Hold `TENTATIVE` with `holdExpiresAt`; request `PENDING` with none; availability "tentative". The calendar labels matched. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: a live hold is "Tentative" with its expiry; a pending request is "Pending"`<br>UI: `frontend/src/features/calendar/calendar-labels.test.tsx::US-54: a pending request is "Pending"; a live hold is "Tentative"`<br>UI: `frontend/src/features/calendar/calendar-labels.test.tsx::US-54 AC-4: a hold shows its expiry; nothing else does`<br>UI: `frontend/src/features/calendar/calendar-labels.test.tsx::US-54: the legend lists Pending and Tentative separately` |

### TC-S3-156

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-156 |
| Story/AC ref | Story 54 AC-5 |
| Test Scenario | Before the expiry, the hold can be converted to a confirmed booking, extended or released |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s1-96-setup.sql + tc-s3-152-setup.sql on testDB (reset before test). Per step, also: tc-s3-154-setup.sql, tc-s3-157-setup.sql, tc-s3-154b-setup.sql. Main Hall (`VEN-079`) is Vera's (venue.staff@example.com), East Annex (`VEN-080`) is Vince's; "Gala" (`EVT-276`, PLANNING, 1 Oct 2030 18:00–22:00 UTC) is Cody's (coord.a@example.com); Leah (lead@example.com) is the Coordinator Lead. Hold expiries in the scripts are relative to the database clock. Logged in as venue.staff@example.com. + tc-s3-154-setup.sql, 154b (a booking that is not a hold), 157 (an expired hold). |
| Test Steps | 1. Convert a hold; convert one after a block is added.<br>2. Extend; extend with invalid expiries.<br>3. Release.<br>4. Try each on an expired hold, on a non-hold, and as Vince.<br>5. Reschedule the event. |
| Test Data | — |
| Expected Result | Convert confirms (re-checking), extend moves the expiry, release frees the slot; none works after expiry, on a non-hold or for another manager. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Convert → APPROVED with a "Converted from hold" decision by Vera; after a block 409, still HELD; extend → new expiry and warning reset; invalid extends 400; release → RELEASED "Released by venue staff", Cody told, slot bookable; expired and non-hold 409; Vince 404; rescheduling the event released the hold ("Event rescheduled"). The panel offered the three actions and called the API. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: convert makes it a confirmed booking, recorded as a decision`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: convert re-runs the approval checks — a block added since refuses it (409)`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: extend moves the expiry and resets the 24-hour warning`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: extend applies the same expiry rules (400)`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: release frees the slot, with the reason recorded and the Coordinator told`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: %s is refused once the hold has expired (409)`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: %s is refused on a booking that is not a hold (409)`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: only the venue manager can act on a hold (404)`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: the hold is released, not moved, and the Coordinator is told`<br>UI: `frontend/src/features/bookings/components/hold-panel.test.tsx::US-54 AC-5: a live hold offers Convert, Extend and Release`<br>UI: `frontend/src/features/bookings/components/hold-panel.test.tsx::US-54 AC-5: convert and release call the API for this hold`<br>UI: `frontend/src/features/bookings/components/hold-panel.test.tsx::US-54: a released hold says why, with no actions` |

### TC-S3-157

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-157 |
| Story/AC ref | Story 54 AC-6 |
| Test Scenario | If the expiry passes without conversion, the hold is released automatically and the slot becomes available |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s1-96-setup.sql + tc-s3-152-setup.sql on testDB (reset before test). Per step, also: tc-s3-154-setup.sql, tc-s3-157-setup.sql, tc-s3-157b-setup.sql. Main Hall (`VEN-079`) is Vera's (venue.staff@example.com), East Annex (`VEN-080`) is Vince's; "Gala" (`EVT-276`, PLANNING, 1 Oct 2030 18:00–22:00 UTC) is Cody's (coord.a@example.com); Leah (lead@example.com) is the Coordinator Lead. Hold expiries in the scripts are relative to the database clock. Logged in as venue.staff@example.com. + tc-s3-154-setup.sql, tc-s3-157-setup.sql (expired an hour ago), 157b (a live hold). |
| Test Steps | 1. With an expired hold not yet released, Cody requests the slot and Vera approves.<br>2. Read the calendar, availability and search.<br>3. Run the expiry job twice at once, then again. |
| Test Data | — |
| Expected Result | An expired hold never blocks or shows; the job releases due holds once and leaves live ones. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Request 201 with no warnings, approval 200; the expired hold RELEASED "Hold expired" on the way, notices sent once; calendar empty, days free, Main Hall in search; the job released only the due hold, once. The every-minute tick runs both jobs even if one fails (unit). The panel hid actions once expired. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: an expired, unreleased hold does not block a request, and approving it succeeds despite the DB constraint`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: an expired hold never shows as held or confirmed — calendar, availability and search`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: expiry releases due holds once, however many times or instances run it`<br>Unit: `src/bookings/hold-expiry.scheduler.spec.ts::releases due holds and sends warnings`<br>Unit: `src/bookings/hold-expiry.scheduler.spec.ts::still sends warnings when the expiry job fails, and logs the failure`<br>UI: `frontend/src/features/bookings/components/hold-panel.test.tsx::US-54 AC-5/AC-6: the actions are hidden once the hold has expired`<br>UI: `frontend/src/features/bookings/components/hold-panel.test.tsx::US-54: isLiveHold mirrors the server — HELD and not yet expired` |

### TC-S3-158

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-158 |
| Story/AC ref | Story 54 AC-7 |
| Test Scenario | The event's Coordinator is notified when the hold is placed, and 24 hours before it expires |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s1-96-setup.sql + tc-s3-152-setup.sql on testDB (reset before test). Per step, also: tc-s3-158-setup.sql, tc-s3-154-setup.sql. Main Hall (`VEN-079`) is Vera's (venue.staff@example.com), East Annex (`VEN-080`) is Vince's; "Gala" (`EVT-276`, PLANNING, 1 Oct 2030 18:00–22:00 UTC) is Cody's (coord.a@example.com); Leah (lead@example.com) is the Coordinator Lead. Hold expiries in the scripts are relative to the database clock. Logged in as venue.staff@example.com. + tc-s3-158-setup.sql (an unassigned event), tc-s3-154-setup.sql. |
| Test Steps | 1. Vera places a hold; read notifications.<br>2. Hold for an unassigned event.<br>3. Run the 24-hour warning job three times (two at once). |
| Test Data | Expiries now + 20 h and + 30 h |
| Expected Result | Cody is told on placing, and once 24 hours before expiry. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | One HOLD_PLACED to Cody with the event, booking and "Held for … UTC until … UTC."; unassigned → Leah instead; HOLD_EXPIRING once each to Cody and Vera, only for the hold due within 24 hours. |
| Status | Pass |
| Remarks | The venue manager (US-40) and the Leads for an unassigned event are told as well. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: placing a hold notifies the event Coordinator`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: an unassigned event notifies the Coordinator Leads instead`<br>Integration: `test/us54-venue-holds.e2e-spec.ts::US-54: the 24-hour warning is sent once, to the Coordinator and the venue manager`<br>Unit: `src/bookings/hold-expiry.scheduler.spec.ts::releases due holds and sends warnings`<br>Unit: `src/bookings/hold-expiry.scheduler.spec.ts::still sends warnings when the expiry job fails, and logs the failure` |

**Story 54 AC ↔ code notes**
- AC-6: an expired hold is free at once to every query, and the every-minute job releases it and sends the notices; the job does not need to run for the slot to be available.
- AC-7: the venue manager (US-40) is also warned, and an unassigned event notifies the Coordinator Leads.

## Story 55 View the Unassigned Event Queue and Assign a Coordinator (Event Coordinator Lead)

### TC-S3-159

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-159 |
| Story/AC ref | Story 55 AC-1 |
| Test Scenario | A newly submitted request goes into the unassigned queue and is not assigned to any Coordinator |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-159b-setup.sql. Users from tc-s3-159-setup.sql only: Olive (olive@example.com, Organiser, Acme Corp), Lena (lena@example.com, Lead), Marcus and Fatima (the only two Coordinators), Vic (Venue Staff). Logged in as lena@example.com. + tc-s3-159b-setup.sql (a draft and an assigned request). |
| Test Steps | 1. Olive submits "Careers Fair".<br>2. Lena reads the queue. |
| Test Data | — |
| Expected Result | The request is unassigned and is the only queue entry; drafts and assigned requests are not queued. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Stored SUBMITTED with no Coordinator and a `submittedAt`; queue = [it]; with the draft and the assigned request the queue was empty. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::is unassigned when the Organiser submits it`<br>Integration: `test/events-assignment.e2e-spec.ts::does not list drafts or already-assigned requests` |

### TC-S3-160

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-160 |
| Story/AC ref | Story 55 AC-2 |
| Test Scenario | Only the Lead can view the queue; Coordinators cannot see it |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-160-setup.sql. Users from tc-s3-159-setup.sql only: Olive (olive@example.com, Organiser, Acme Corp), Lena (lena@example.com, Lead), Marcus and Fatima (the only two Coordinators), Vic (Venue Staff). "Freshman Orientation 2030" (`EVT-283`) is SUBMITTED with no Coordinator. Logged in as lena@example.com. |
| Test Steps | 1. Marcus, Fatima, Olive and Vic open the queue, a queued request, and assign.<br>2. No login. |
| Test Data | — |
| Expected Result | All refused. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | 403 for each role on all three; 401 without a token. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::refuses every other role, Coordinators included`<br>Integration: `test/events-assignment.e2e-spec.ts::requires authentication` |

### TC-S3-161

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-161 |
| Story/AC ref | Story 55 AC-3 |
| Test Scenario | Each entry shows event name, Organiser and organisation, category, preferred date/time, attendance and submission time, oldest first |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-160-setup.sql, tc-s3-161-setup.sql. Users from tc-s3-159-setup.sql only: Olive (olive@example.com, Organiser, Acme Corp), Lena (lena@example.com, Lead), Marcus and Fatima (the only two Coordinators), Vic (Venue Staff). "Freshman Orientation 2030" (`EVT-283`) is SUBMITTED with no Coordinator. Logged in as lena@example.com. + tc-s3-161-setup.sql (three requests a month apart). |
| Test Steps | 1. Lena reads the queue. |
| Test Data | — |
| Expected Result | Every field shown; oldest submission first. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Entry had name, Olive with email, "Acme Corp", "Student engagement", 1 Oct 2030 09:00–17:00, 99, submitted 1 Jan 2030; order Oldest, Middle, Newest. The queue page showed each field. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::lists event, Organiser, organisation, category, date, attendance and submission time`<br>Integration: `test/events-assignment.e2e-spec.ts::lists the oldest submission first`<br>UI: `frontend/src/pages/lead-queue.test.tsx::shows event, Organiser and organisation, category, preferred date, attendance and submission time` |

### TC-S3-162

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-162 |
| Story/AC ref | Story 55 AC-4 |
| Test Scenario | A queued request can be opened to view its basic event information before assigning |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-160-setup.sql, tc-s3-162-setup.sql, tc-s3-162b-setup.sql. Users from tc-s3-159-setup.sql only: Olive (olive@example.com, Organiser, Acme Corp), Lena (lena@example.com, Lead), Marcus and Fatima (the only two Coordinators), Vic (Venue Staff). "Freshman Orientation 2030" (`EVT-283`) is SUBMITTED with no Coordinator. Logged in as lena@example.com. + tc-s3-162-setup.sql (layout), 162b (already with Marcus). |
| Test Steps | 1. Lena opens `EVT-283`.<br>2. Opens it after it has left the queue. |
| Test Data | — |
| Expected Result | Its details are shown; a request no longer queued cannot be opened from the queue. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Name, purpose, description, SUBMITTED, THEATRE "Stage left", Acme Corp; after leaving the queue 404. The page showed the details. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::shows its basic event information`<br>Integration: `test/events-assignment.e2e-spec.ts::does not open a request that has left the queue`<br>UI: `frontend/src/pages/lead-queue.test.tsx::shows the request, and assigns it to the chosen Coordinator` |

### TC-S3-163

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-163 |
| Story/AC ref | Story 55 AC-5 |
| Test Scenario | The request can be assigned to one Coordinator chosen from the active Event Coordinators |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-160-setup.sql, tc-s3-159b-setup.sql. Users from tc-s3-159-setup.sql only: Olive (olive@example.com, Organiser, Acme Corp), Lena (lena@example.com, Lead), Marcus and Fatima (the only two Coordinators), Vic (Venue Staff). "Freshman Orientation 2030" (`EVT-283`) is SUBMITTED with no Coordinator. Logged in as lena@example.com. + tc-s3-159b-setup.sql (a draft). |
| Test Steps | 1. Lena lists the Coordinators.<br>2. Assigns to Vic, to herself and to an unknown user.<br>3. Assigns a draft. |
| Test Data | — |
| Expected Result | Only Coordinators are offered and accepted. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | List: Fatima, Marcus; Vic and Lena 400; unknown 404; draft 404. Assign stayed disabled until a Coordinator was chosen. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::lists Coordinators only`<br>Integration: `test/events-assignment.e2e-spec.ts::refuses a target who is not a Coordinator`<br>Integration: `test/events-assignment.e2e-spec.ts::does not assign a draft`<br>UI: `frontend/src/pages/lead-queue.test.tsx::shows the request, and assigns it to the chosen Coordinator` |

### TC-S3-164

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-164 |
| Story/AC ref | Story 55 AC-6 |
| Test Scenario | On assignment the request leaves the queue, appears in that Coordinator's list, and the change history records who, to whom and when |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-160-setup.sql. Users from tc-s3-159-setup.sql only: Olive (olive@example.com, Organiser, Acme Corp), Lena (lena@example.com, Lead), Marcus and Fatima (the only two Coordinators), Vic (Venue Staff). "Freshman Orientation 2030" (`EVT-283`) is SUBMITTED with no Coordinator. Logged in as lena@example.com. |
| Test Steps | 1. Lena assigns `EVT-283` to Marcus.<br>2. Read the queue, Marcus's and Fatima's lists, and the history. |
| Test Data | — |
| Expected Result | Gone from the queue; only in Marcus's list; history entry by Lena with time. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Response coordinator Marcus, still SUBMITTED; queue empty; Marcus's list [it], Fatima's empty; one history entry by Lena: coordinator null → Marcus, with a time. The page confirmed "Assigned to Marcus". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::removes the request from the queue and puts it in that Coordinator’s list`<br>Integration: `test/events-assignment.e2e-spec.ts::records who assigned it, to whom and when in the change history`<br>UI: `frontend/src/pages/lead-queue.test.tsx::shows the request, and assigns it to the chosen Coordinator` |

### TC-S3-165

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-165 |
| Story/AC ref | Story 55 AC-7 |
| Test Scenario | The assigned Coordinator is notified |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-160-setup.sql. Users from tc-s3-159-setup.sql only: Olive (olive@example.com, Organiser, Acme Corp), Lena (lena@example.com, Lead), Marcus and Fatima (the only two Coordinators), Vic (Venue Staff). "Freshman Orientation 2030" (`EVT-283`) is SUBMITTED with no Coordinator. Logged in as lena@example.com. |
| Test Steps | 1. Lena assigns to Marcus. |
| Test Data | — |
| Expected Result | Marcus is notified. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | EVENT_ASSIGNED to Marcus (and COORDINATOR_ASSIGNED to Olive, US-65). |
| Status | Pass |
| Remarks | The card's open question (tell the Organiser?) is answered by US-65. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::notifies the assigned Coordinator` |

### TC-S3-166

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-166 |
| Story/AC ref | Story 55 AC-8 |
| Test Scenario | A request still in the queue cannot be reviewed or edited by any Coordinator |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-160-setup.sql. Users from tc-s3-159-setup.sql only: Olive (olive@example.com, Organiser, Acme Corp), Lena (lena@example.com, Lead), Marcus and Fatima (the only two Coordinators), Vic (Venue Staff). "Freshman Orientation 2030" (`EVT-283`) is SUBMITTED with no Coordinator. Logged in as lena@example.com. |
| Test Steps | 1. Marcus and Fatima list, open, approve, reject and start planning `EVT-283`. |
| Test Data | — |
| Expected Result | Invisible and refused; status unchanged. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Lists empty; every action 404; still SUBMITTED. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::is invisible and untouchable to Coordinators` |

### TC-S3-167

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-167 |
| Story/AC ref | Story 55 AC-9 |
| Test Scenario | Assigning a request that is already assigned is blocked and the current assignee is shown |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-160-setup.sql. Users from tc-s3-159-setup.sql only: Olive (olive@example.com, Organiser, Acme Corp), Lena (lena@example.com, Lead), Marcus and Fatima (the only two Coordinators), Vic (Venue Staff). "Freshman Orientation 2030" (`EVT-283`) is SUBMITTED with no Coordinator. Logged in as lena@example.com. |
| Test Steps | 1. Lena assigns to Marcus, then to Fatima.<br>2. Two assignments at once. |
| Test Data | — |
| Expected Result | Blocked, naming Marcus; nothing changes; no second notice. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Second assign 409 with `currentAssignee` Marcus; still Marcus; Olive notified once; of two simultaneous assigns one 200, one 409, one history entry. The page showed "already assigned to …". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::blocks an already-assigned request and shows the current assignee`<br>Integration: `test/events-assignment.e2e-spec.ts::US-65 AC1: Given the event is already assigned, When a Lead assigns it again, Then the Organiser is not notified again`<br>Integration: `test/events-assignment.e2e-spec.ts::lets only one of two simultaneous assignments win`<br>UI: `frontend/src/pages/lead-queue.test.tsx::shows the current assignee when the request was already assigned` |

**Story 55 AC ↔ code notes**
- AC-7: the Organiser is also notified (US-65), answering the card's open question.

## Story 56 Reassign Events and Oversee Coordinator Assignments (Event Coordinator Lead)

### TC-S3-168

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-168 |
| Story/AC ref | Story 56 AC-1 |
| Test Scenario | Every Coordinator is shown with their active events (name, status, date) and a count; active means not completed, cancelled or rejected |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-168-setup.sql. Users from tc-s3-159-setup.sql only (Lena the Lead; Marcus and Fatima, the only two Coordinators). Logged in as lena@example.com. + tc-s3-168-setup.sql (Marcus: Later, Sooner, three closed; one queued). |
| Test Steps | 1. Lena opens the assignments view. |
| Test Data | — |
| Expected Result | Fatima 0; Marcus 2 (Sooner, Later); closed and queued events not counted. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Fatima: 0, none; Marcus: 2 — Sooner CONFIRMED 1 Nov 2030, Later PLANNING 1 Dec 2030. The page showed counts, status and dates. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::lists every Coordinator with their active events and a count`<br>UI: `frontend/src/pages/lead-assignments.test.tsx::shows each Coordinator with a count and their events, and filters by Coordinator` |

### TC-S3-169

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-169 |
| Story/AC ref | Story 56 AC-2 |
| Test Scenario | The view can be filtered by Coordinator |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-169-setup.sql. Users from tc-s3-159-setup.sql only (Lena the Lead; Marcus and Fatima, the only two Coordinators). Logged in as lena@example.com. + tc-s3-169-setup.sql (one event each). |
| Test Steps | 1. Filter by Fatima.<br>2. Filter by Vic. |
| Test Data | — |
| Expected Result | Only Fatima; a non-Coordinator is refused. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | One group, Fatima, count 1; Vic 400. The page asked for Fatima only. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::filters by Coordinator`<br>UI: `frontend/src/pages/lead-assignments.test.tsx::shows each Coordinator with a count and their events, and filters by Coordinator` |

### TC-S3-170

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-170 |
| Story/AC ref | Story 56 AC-3 |
| Test Scenario | An active event can be reassigned to a different Coordinator; reassigning to the current one is blocked |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-170-setup.sql, tc-s3-160-setup.sql. Users from tc-s3-159-setup.sql only (Lena the Lead; Marcus and Fatima, the only two Coordinators). `EVT-296` is in planning with Marcus. Logged in as lena@example.com. + tc-s3-160-setup.sql for the queued case. |
| Test Steps | 1. Reassign `EVT-296` to Marcus.<br>2. Reassign a queued request. |
| Test Data | — |
| Expected Result | Same Coordinator refused; queued requests go through assignment instead. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | To Marcus 400; queued request 409. Reassigning to Fatima: TC-S3-172. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::blocks reassigning to the current Coordinator`<br>Integration: `test/events-assignment.e2e-spec.ts::refers an unassigned request back to the queue` |

### TC-S3-171

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-171 |
| Story/AC ref | Story 56 AC-4 |
| Test Scenario | Completed, cancelled and rejected events cannot be reassigned |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-171-setup.sql. Users from tc-s3-159-setup.sql only (Lena the Lead; Marcus and Fatima, the only two Coordinators). Logged in as lena@example.com. + tc-s3-171-setup.sql (Marcus's closed events). |
| Test Steps | 1. Reassign each closed event to Fatima. |
| Test Data | — |
| Expected Result | Each refused; still Marcus. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Each 409; Coordinator still Marcus. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::blocks a %s event` |

### TC-S3-172

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-172 |
| Story/AC ref | Story 56 AC-5 |
| Test Scenario | After reassignment the previous Coordinator can no longer view or manage the event, and the new one can |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-170-setup.sql. Users from tc-s3-159-setup.sql only (Lena the Lead; Marcus and Fatima, the only two Coordinators). `EVT-296` is in planning with Marcus. Logged in as lena@example.com. |
| Test Steps | 1. Reassign `EVT-296` to Fatima.<br>2. Marcus and Fatima open it. |
| Test Data | — |
| Expected Result | Marcus loses it; Fatima gains it. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | 200; Marcus 404 to view and approve; Fatima 200. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::moves the event: the previous Coordinator loses it and the new one gains it` |

### TC-S3-173

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-173 |
| Story/AC ref | Story 56 AC-6 |
| Test Scenario | Comments, bookings, reservations and history are unchanged, and pending change requests move to the new Coordinator |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-170-setup.sql, tc-s3-173-setup.sql. Users from tc-s3-159-setup.sql only (Lena the Lead; Marcus and Fatima, the only two Coordinators). `EVT-296` is in planning with Marcus. Logged in as lena@example.com. + tc-s3-173-setup.sql (a pending booking, a message, a pending change request). |
| Test Steps | 1. Read pending change requests for each.<br>2. Reassign to Fatima.<br>3. Read again, and the booking and message. |
| Test Data | — |
| Expected Result | The change request moves; everything else unchanged. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Pending: Marcus 1 / Fatima 0, then 0 / 1; booking still requested by Marcus, REQUESTED; message unchanged; event still PLANNING. |
| Status | Pass |
| Remarks | Reassignment writes only the event's Coordinator, so reservations (none in this setup) are untouched as well. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::leaves bookings, reservations and comments untouched, and moves pending change requests` |

### TC-S3-174

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-174 |
| Story/AC ref | Story 56 AC-7 |
| Test Scenario | The reassignment (who, from, to, when) is recorded in the change history |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-160-setup.sql. Users from tc-s3-159-setup.sql only (Lena the Lead; Marcus and Fatima, the only two Coordinators).  Logged in as lena@example.com. + tc-s3-160-setup.sql. |
| Test Steps | 1. Lena assigns to Marcus, then reassigns to Fatima.<br>2. Fatima reads the history. |
| Test Data | — |
| Expected Result | Both entries kept; the second by Lena, Marcus → Fatima. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Entries: null → Marcus, Marcus → Fatima; second changed by Lena. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::records who, from and to in the change history, and keeps earlier entries` |

### TC-S3-175

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-175 |
| Story/AC ref | Story 56 AC-8 |
| Test Scenario | The previous and new Coordinators are notified |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-170-setup.sql. Users from tc-s3-159-setup.sql only (Lena the Lead; Marcus and Fatima, the only two Coordinators). `EVT-296` is in planning with Marcus. Logged in as lena@example.com. |
| Test Steps | 1. Reassign to Fatima. |
| Test Data | — |
| Expected Result | Marcus and Fatima notified. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | EVENT_REASSIGNED to Marcus and Fatima (and COORDINATOR_ASSIGNED to Olive: "Your coordinator for … is now Fatima."). |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::notifies both the previous and the new Coordinator` |

### TC-S3-176

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-176 |
| Story/AC ref | Story 56 AC-9 |
| Test Scenario | Only the Lead can reassign or see all assignments; a Coordinator sees only their own events |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql on testDB (reset before test). Per step, also: tc-s3-170-setup.sql, tc-s3-169-setup.sql. Users from tc-s3-159-setup.sql only (Lena the Lead; Marcus and Fatima, the only two Coordinators). `EVT-296` is in planning with Marcus. Logged in as lena@example.com. + tc-s3-169-setup.sql. |
| Test Steps | 1. Marcus, Fatima, Olive and Vic reassign and open the view.<br>2. Marcus uses the old Coordinator routes.<br>3. Marcus lists his events. |
| Test Data | — |
| Expected Result | All refused; Marcus sees only his own. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Reassign and view 403 for each; old routes 404; Marcus's list had only his event. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::removes the Coordinator-side routes`<br>Integration: `test/events-assignment.e2e-spec.ts::is Lead-only; a Coordinator sees only their own events`<br>Integration: `test/events-assignment.e2e-spec.ts::is Lead-only` |

**Story 56 AC ↔ code notes**
- No mismatches. Reassignment by the Lead replaces US-26's Coordinator-side reassignment (the old routes return 404).

## Story 57 Conduct an Operational Safety Check on an Event (Safety Officer)

### TC-S3-177

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-177 |
| Story/AC ref | Story 57 AC-1 |
| Test Scenario | An event appears in the Safety queue once all its venue bookings are approved and any requested equipment is reserved |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql on testDB (reset before test). Per step, also: tc-s3-177b-setup.sql, tc-s3-177c-setup.sql, tc-s3-177d-setup.sql, tc-s3-177e-setup.sql, tc-s3-177f-setup.sql, tc-s3-178-setup.sql, tc-s3-177g-setup.sql. Sam and Mei (sam.officer@ / mei.officer@example.com) are the only Safety Officers. "Careers Fair" (`EVT-300`, PLANNING, 150 people, theatre, step-free) is Cody's; Main Hall (`VEN-082`, 200, "No open flames…") is Vera's; 10 wireless microphones (`EQP-022`). Logged in as sam.officer@example.com. Variants: tc-s3-177b/177c (pending bookings), 177d (4 microphones needed), 177e/177f (approved bookings), 178 + 177g (microphones reserved, then released). |
| Test Steps | 1. Approve the booking; read the queue; Cody confirms.<br>2. Confirm with a booking still pending, and before equipment is reserved.<br>3. Queue two events.<br>4. Reverse the approval, or release the equipment, while it waits. |
| Test Data | — |
| Expected Result | It enters only when everything is approved and reserved; oldest first; it leaves if that stops being true. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Not queued until Cody confirmed, then AWAITING_SAFETY_CHECK and listed; confirm 409 with a pending booking or unreserved equipment, 200 once reserved; older event first; reversed approval or released equipment → back to PLANNING, queue empty. |
| Status | Pass |
| Remarks | Entry is through the Coordinator's Confirm (Story 42). The card's note marks the automatic trigger as an assumption; the event never enters before everything is approved and reserved. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::enters the queue when the Coordinator confirms the ready arrangements (US-42), not on its own`<br>Integration: `test/safety-check.e2e-spec.ts::waits while any booking is still pending`<br>Integration: `test/safety-check.e2e-spec.ts::waits for requested equipment to be reserved, then can be confirmed`<br>Integration: `test/safety-check.e2e-spec.ts::lists the longest-waiting event first`<br>Integration: `test/safety-check.e2e-spec.ts::takes an event back out if an approval is withdrawn before it is checked`<br>Integration: `test/safety-check.e2e-spec.ts::takes an event back out once its equipment is no longer reserved` |

### TC-S3-178

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-178 |
| Story/AC ref | Story 57 AC-2 |
| Test Scenario | The review shows attendance, each venue's capacity and the layout, accessibility, equipment, and venue restrictions or blocks |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql on testDB (reset before test). Per step, also: tc-s3-177e-setup.sql, tc-s3-178-setup.sql, tc-s3-178b-setup.sql. Sam and Mei (sam.officer@ / mei.officer@example.com) are the only Safety Officers. "Careers Fair" (`EVT-300`, PLANNING, 150 people, theatre, step-free) is Cody's; Main Hall (`VEN-082`, 200, "No open flames…") is Vera's; 10 wireless microphones (`EQP-022`). With tc-s3-177e-setup.sql Main Hall is approved and Cody confirms the arrangements, so the event waits for its check. Logged in as sam.officer@example.com. + tc-s3-178-setup.sql (2 microphones reserved) + tc-s3-178b-setup.sql (a block, "Fire alarm testing"). |
| Test Steps | 1. Sam opens the review.<br>2. Opens an event not awaiting a check. |
| Test Data | — |
| Expected Result | Every factor is shown. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | 150, THEATRE, STEP_FREE_ACCESS; Main Hall 200 (margin 50) with its restrictions and one block; 2 microphones requested and reserved; an event not awaiting a check 404. The page showed capacity, restrictions, blocks and equipment. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::shows attendance, venue capacity, layout, accessibility, equipment and venue restrictions`<br>Integration: `test/safety-check.e2e-spec.ts::does not open an event that is not awaiting a check`<br>UI: `frontend/src/pages/safety-review.test.tsx::shows each venue's capacity, restrictions and blocks, and the requested equipment` |

### TC-S3-179

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-179 |
| Story/AC ref | Story 57 AC-3 |
| Test Scenario | Comments can be recorded on emergency access, crowd movement, equipment placement and accessibility |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql on testDB (reset before test). Per step, also: tc-s3-177e-setup.sql. Sam and Mei (sam.officer@ / mei.officer@example.com) are the only Safety Officers. "Careers Fair" (`EVT-300`, PLANNING, 150 people, theatre, step-free) is Cody's; Main Hall (`VEN-082`, 200, "No open flames…") is Vera's; 10 wireless microphones (`EQP-022`). With tc-s3-177e-setup.sql Main Hall is approved and Cody confirms the arrangements, so the event waits for its check. Logged in as sam.officer@example.com. |
| Test Steps | 1. Sam approves with a comment on each factor. |
| Test Data | "Two clear exits", "Wide aisles", "Cables taped down", "Ramp at the side door" |
| Expected Result | The four comments are recorded with the decision. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | All four returned on the recorded review. The form sent a factor comment only when "Add a comment" was chosen. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::confirms the event and records the decision, the Safety Officer and the time`<br>UI: `frontend/src/pages/safety-review.test.tsx::requires a stage and a reason to request changes, then sends them with the factor comment` |

### TC-S3-180

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-180 |
| Story/AC ref | Story 57 AC-4 |
| Test Scenario | One outcome is chosen (approve, reject or request changes); reject and request changes need a reason |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql on testDB (reset before test). Per step, also: tc-s3-177e-setup.sql. Sam and Mei (sam.officer@ / mei.officer@example.com) are the only Safety Officers. "Careers Fair" (`EVT-300`, PLANNING, 150 people, theatre, step-free) is Cody's; Main Hall (`VEN-082`, 200, "No open flames…") is Vera's; 10 wireless microphones (`EQP-022`). With tc-s3-177e-setup.sql Main Hall is approved and Cody confirms the arrangements, so the event waits for its check. Logged in as sam.officer@example.com. |
| Test Steps | 1. Reject and request changes without a reason, and with a blank one.<br>2. Request changes without, or with an unknown, stage.<br>3. Decide twice; decide twice at once; decide an unknown event. |
| Test Data | — |
| Expected Result | Refused without a reason or stage; one decision only. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Each 400, still awaiting, no review saved; second decision 409 (still CONFIRMED); simultaneous: one 200, one 409, one review; unknown event 404. The form required a stage and a reason before sending. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::%s without a reason is refused and changes nothing`<br>Integration: `test/safety-check.e2e-spec.ts::requesting changes also needs the stage to return to`<br>Integration: `test/safety-check.e2e-spec.ts::refuses a decision on, or the history of, an event that does not exist (404)`<br>Integration: `test/safety-check.e2e-spec.ts::refuses a second decision on an event that has already been decided`<br>Integration: `test/safety-check.e2e-spec.ts::lets only one of two simultaneous decisions win`<br>UI: `frontend/src/pages/safety-review.test.tsx::requires a stage and a reason to request changes, then sends them with the factor comment` |

### TC-S3-181

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-181 |
| Story/AC ref | Story 57 AC-5 |
| Test Scenario | Approve makes the event eligible for preparation and records the decision, Safety Officer and time |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql on testDB (reset before test). Per step, also: tc-s3-177e-setup.sql. Sam and Mei (sam.officer@ / mei.officer@example.com) are the only Safety Officers. "Careers Fair" (`EVT-300`, PLANNING, 150 people, theatre, step-free) is Cody's; Main Hall (`VEN-082`, 200, "No open flames…") is Vera's; 10 wireless microphones (`EQP-022`). With tc-s3-177e-setup.sql Main Hall is approved and Cody confirms the arrangements, so the event waits for its check. Logged in as sam.officer@example.com. |
| Test Steps | 1. Sam approves.<br>2. Read the queue and Cody's notifications. |
| Test Data | — |
| Expected Result | Event CONFIRMED; decision, Sam and time recorded. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | APPROVED, `eventStatus` CONFIRMED, officer Sam, `createdAt` set; queue empty; one SAFETY_CHECK_DECIDED to Cody. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::confirms the event and records the decision, the Safety Officer and the time`<br>Integration: `test/safety-check.e2e-spec.ts::notifies the Coordinator` |

### TC-S3-182

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-182 |
| Story/AC ref | Story 57 AC-6 |
| Test Scenario | Request changes: the Safety Officer selects the stage to return to, the event returns to the Coordinator, the arrangements are flagged, and the Coordinator is notified with the reasons |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql on testDB (reset before test). Per step, also: tc-s3-177e-setup.sql, tc-s3-178-setup.sql. Sam and Mei (sam.officer@ / mei.officer@example.com) are the only Safety Officers. "Careers Fair" (`EVT-300`, PLANNING, 150 people, theatre, step-free) is Cody's; Main Hall (`VEN-082`, 200, "No open flames…") is Vera's; 10 wireless microphones (`EQP-022`). With tc-s3-177e-setup.sql Main Hall is approved and Cody confirms the arrangements, so the event waits for its check. Logged in as sam.officer@example.com. + tc-s3-178-setup.sql for the technical stage. |
| Test Steps | 1. Sam requests changes, stage venue, "Only one exit for 150 people".<br>2. Another with stage technical.<br>3. Read the queue. |
| Test Data | — |
| Expected Result | Back in planning with the right arrangement flagged and unchanged; Cody told why; not requeued until he answers. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | PLANNING, `affectedArrangements` [VENUE_BOOKING], booking still APPROVED, Cody's notice with the reason, "venue planning" and "send it back for a safety check"; technical → [EQUIPMENT_RESERVATION], reservation still APPROVED; the queue stayed empty. The page said "back in venue planning". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::returns the event to the Coordinator in planning, flags the stage, changes no arrangement, and says why`<br>Integration: `test/safety-check.e2e-spec.ts::returning to technical planning flags the equipment and leaves it reserved`<br>Integration: `test/safety-check.e2e-spec.ts::is held out of the queue, however complete its arrangements are, until the Coordinator answers`<br>UI: `frontend/src/pages/safety-review.test.tsx::requires a stage and a reason to request changes, then sends them with the factor comment` |

### TC-S3-183

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-183 |
| Story/AC ref | Story 57 AC-7 |
| Test Scenario | Reject: the event stays blocked from preparation and the Coordinator is notified with the reasons |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql on testDB (reset before test). Per step, also: tc-s3-177e-setup.sql. Sam and Mei (sam.officer@ / mei.officer@example.com) are the only Safety Officers. "Careers Fair" (`EVT-300`, PLANNING, 150 people, theatre, step-free) is Cody's; Main Hall (`VEN-082`, 200, "No open flames…") is Vera's; 10 wireless microphones (`EQP-022`). With tc-s3-177e-setup.sql Main Hall is approved and Cody confirms the arrangements, so the event waits for its check. Logged in as sam.officer@example.com. |
| Test Steps | 1. Sam rejects, "No safe route out".<br>2. Cody tries to resubmit, then resumes planning, changes the plan and resubmits. |
| Test Data | — |
| Expected Result | SAFETY_REJECTED, out of the queue, arrangements untouched, Cody told why; rework goes back through planning. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | SAFETY_REJECTED with both arrangements flagged; queue empty; booking APPROVED; notice with the reason; resubmit 409 until planning resumed; then back in the queue with `lastOutcome` REJECTED. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::blocks the event, takes it out of the queue, leaves its arrangements alone and tells the Coordinator why`<br>Integration: `test/safety-check.e2e-spec.ts::is reworked by the Coordinator: resume planning, change the plan, send it back` |

### TC-S3-184

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-184 |
| Story/AC ref | Story 57 AC-8 |
| Test Scenario | An event with no approved safety check cannot move to preparation |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql on testDB (reset before test). Per step, also: tc-s3-177e-setup.sql. Sam and Mei (sam.officer@ / mei.officer@example.com) are the only Safety Officers. "Careers Fair" (`EVT-300`, PLANNING, 150 people, theatre, step-free) is Cody's; Main Hall (`VEN-082`, 200, "No open flames…") is Vera's; 10 wireless microphones (`EQP-022`). Logged in as sam.officer@example.com. (+ tc-s3-177e-setup.sql for step 2). |
| Test Steps | 1. Cody, Sam and Olive try to confirm or set CONFIRMED on a planning event.<br>2. Cody pulls a waiting event back into planning. |
| Test Data | — |
| Expected Result | No route reaches CONFIRMED; a pending check cannot be bypassed. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Every attempt ≥ 400, still PLANNING; start-planning on a waiting event 409, still AWAITING_SAFETY_CHECK. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::has no route that confirms an event, whoever asks`<br>Integration: `test/safety-check.e2e-spec.ts::a Coordinator cannot pull an event out of its pending check` |

### TC-S3-185

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-185 |
| Story/AC ref | Story 57 AC-9 |
| Test Scenario | After changes are made, the event returns to the queue for a new check; earlier checks remain in history |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql on testDB (reset before test). Per step, also: tc-s3-177e-setup.sql, tc-s3-177c-setup.sql, tc-s3-185-setup.sql. Sam and Mei (sam.officer@ / mei.officer@example.com) are the only Safety Officers. "Careers Fair" (`EVT-300`, PLANNING, 150 people, theatre, step-free) is Cody's; Main Hall (`VEN-082`, 200, "No open flames…") is Vera's; 10 wireless microphones (`EQP-022`). With tc-s3-177e-setup.sql Main Hall is approved and Cody confirms the arrangements, so the event waits for its check. Logged in as sam.officer@example.com. + tc-s3-177c-setup.sql (a new pending booking), tc-s3-185-setup.sql (cancelled while waiting). |
| Test Steps | 1. After a request for changes, Cody resubmits with nothing changed, then after changing the plan (with a comment).<br>2. Sam re-checks and approves; read the history.<br>3. Edge cases: blank or long comment, unapproved new booking, twice, cancelled, no feedback, another Coordinator. |
| Test Data | — |
| Expected Result | Back in the queue only after a change; the earlier check stays in the history. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | No change 409; after the edit AWAITING_SAFETY_CHECK, queue showed `previousReviews` 1 and the last outcome; history [CHANGES_REQUESTED, APPROVED], the comment trimmed and shown; blank comment → none; 1001 characters 400; unapproved booking 409; second resubmit 409; cancelled 409; no feedback 409; Casey 404, other roles 403; Casey cannot read the history (404). |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::refuses to resubmit an event nothing has changed on`<br>Integration: `test/safety-check.e2e-spec.ts::sends the event back to the Safety Officer once the plan has changed, as a re-check with the history kept`<br>Integration: `test/safety-check.e2e-spec.ts::lets the Coordinator tell the Safety Officer what changed, and shows it with the feedback it answers`<br>Integration: `test/safety-check.e2e-spec.ts::treats a blank comment as none, and the comment as optional`<br>Integration: `test/safety-check.e2e-spec.ts::refuses a comment that is too long and does not send the event back`<br>Integration: `test/safety-check.e2e-spec.ts::counts a changed booking as a change, and a new one that is not yet approved as not ready`<br>Integration: `test/safety-check.e2e-spec.ts::cannot be resubmitted twice`<br>Integration: `test/safety-check.e2e-spec.ts::cannot send back an event that was cancelled while the feedback waited`<br>Integration: `test/safety-check.e2e-spec.ts::has nothing to answer when there is no feedback`<br>Integration: `test/safety-check.e2e-spec.ts::is the assigned Coordinator’s alone`<br>Integration: `test/safety-check.e2e-spec.ts::is reworked by the Coordinator: resume planning, change the plan, send it back`<br>Integration: `test/safety-check.e2e-spec.ts::shows the checks and reasons to the event’s Coordinator, and to no other Coordinator` |

### TC-S3-186

| Test case specification | |
|---|---|
| Test Case ID | TC-S3-186 |
| Story/AC ref | Story 57 AC-10 |
| Test Scenario | Only the Safety Officer can record a decision |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql on testDB (reset before test). Per step, also: tc-s3-177e-setup.sql. Sam and Mei (sam.officer@ / mei.officer@example.com) are the only Safety Officers. "Careers Fair" (`EVT-300`, PLANNING, 150 people, theatre, step-free) is Cody's; Main Hall (`VEN-082`, 200, "No open flames…") is Vera's; 10 wireless microphones (`EQP-022`). With tc-s3-177e-setup.sql Main Hall is approved and Cody confirms the arrangements, so the event waits for its check. Logged in as sam.officer@example.com. |
| Test Steps | 1. Cody, Olive, Vera, Toby and Ann decide, open the queue and the review.<br>2. No login. |
| Test Data | — |
| Expected Result | All refused; nothing recorded. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-27 |
| **Test execution record** | |
| Actual Result | Each 403 on all three; still awaiting; no review; no token 401. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-27 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::refuses every other role at the decision, the queue and the review`<br>Integration: `test/safety-check.e2e-spec.ts::requires authentication` |

**Story 57 AC ↔ code notes**
- AC-1: the queue entry is the Coordinator's Confirm (Story 42) once everything is approved and reserved, not automatic. The card notes the trigger was an assumption.
- US-64 (Safety Officers alerted when a check is due) is tested in the same file but is not a Sprint 3 card, so it has no test case here.
