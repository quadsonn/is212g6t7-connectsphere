# Sprint 1 test cases

Written test cases for the Sprint 1 user stories, traced from story → acceptance criterion → test case → automated test. Story and AC numbering follows [CONVENTIONS.md](CONVENTIONS.md).

## How to read this file

- Each test case is one table in the course template. The top part is the test case specification and the bottom part is the test execution record.
- **Pre-conditions** name the exact SQL setup script(s) the test case needs. The automated test loads that same script, which is the traceability link. Scripts live in `test/fixtures/sql/`, and its [README](../../test/fixtures/sql/README.md) lists every row they create. All base users share the password `correct-horse-battery-staple`.
- **Expected Result** is written from the AC wording, not from the code. Where the two disagree, the mismatch is listed at the end of each story group.
- **Automated by** gives `<file>::<exact test name>`. Test names with `%s` are table-driven (`it.each`), and every row is run.
- **Week 7 customer changes.** Expected Results follow the current AC wording, updated for Change 5 where it applies: new submissions go to the Event Coordinator Lead's unassigned queue, and Coordinators can't review or edit unassigned requests. Change 5 and Change 6 (the Safety Officer's safety-check stage) are being built on `Sprint3-MAIN` and aren't on this branch yet. No test here asserts the old behaviour as correct.
- **Denied = 404 by design.** A user who may not see a request gets 404 rather than 403, so its existence isn't revealed. Remarks note this wherever it applies.

**Legend**

| Value | Meaning |
|---|---|
| Status **Pass** | The automated test ran and the system behaved as the Expected Result says. |
| Status **Fail** | The automated test ran and the system did not behave as expected. These are known bugs, and Remarks name the audit gap. |
| Status **Not Executed** | No automated test exists yet. |
| Automated by **GAP** | No existing test covers this test case. It is listed in "Gaps". |
| Automated by **Playwright (pending)** | The AC is about the user interface, and will be covered by an end-to-end browser test. |
| Remarks **Pending Change 5 merge** | The Expected Result follows Week 7 Change 5 (Event Coordinator Lead and the unassigned queue). That code is on `Sprint3-MAIN` and not yet on this branch. |

**Run the tests:** `npm run test:e2e -- test/<file>.e2e-spec.ts`. This runs against the local `connectsphere_test` database only.

---

## US-07 Review submitted request for clarity/completeness (Event Coordinator)

### TC-S1-01

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-01 |
| Story/AC ref | US-07 AC-3 |
| Test Scenario | Coordinator approves a submitted request that is ready to proceed (happy path) |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator). Request `e-submitted` is SUBMITTED and assigned to Cody. |
| Test Steps | 1. Cody clicks "Approve" on request `e-submitted` (`POST /events/e-submitted/approve`).<br>2. Read the request back.<br>3. Log in as organiser@example.com and open "My requests". |
| Test Data | Request `e-submitted` ("Freshman Orientation 2030") |
| Expected Result | The request status updates to "Approved". The Organiser sees it as Approved. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 200 with status APPROVED. The stored status is APPROVED. The Organiser's list shows APPROVED. |
| Status | Pass |
| Remarks | Approval requires an assigned Coordinator, consistent with Week 7 Change 5. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-review.e2e-spec.ts::moves a submitted request to APPROVED`<br>`test/events-review.e2e-spec.ts::is visible to the Organiser afterwards` |

### TC-S1-02

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-02 |
| Story/AC ref | US-07 AC-1 |
| Test Scenario | Coordinator views a request and sees its current status, for each status the AC lists |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-02-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. Requests `e-draft`, `e-submitted`, `e-under-review`, `e-approved`, `e-returned` and `e-rejected` are all assigned to Cody. |
| Test Steps | 1. Cody opens each request in turn (`GET /events/assigned/<id>`).<br>2. Note the status shown. For the returned request, also note the outstanding question. |
| Test Data | DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, RETURNED ("Please confirm the attendance figure"), REJECTED |
| Expected Result | Each request displays its current status: draft, submitted, under review, approved, returned, rejected. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | All six requests returned their stored status. The returned request also showed `clarificationRequested: true` and its question. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-review.e2e-spec.ts::shows %s` (DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED)<br>`test/events-review.e2e-spec.ts::shows a returned request with its outstanding question` |

### TC-S1-03

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-03 |
| Story/AC ref | US-07 AC-2 |
| Test Scenario | Coordinator opens a submitted request and sees all its details |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody opens request `e-submitted` (`GET /events/assigned/e-submitted`). |
| Test Data | Name "Freshman Orientation 2030"; purpose "Welcome new students"; description "Full-day programme with talks and booths"; 2030-10-01 09:00–17:00 UTC |
| Expected Result | All details are displayed: name, purpose, description, and proposed date and time, exactly as entered. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Name, purpose, description, start (2030-10-01T09:00:00.000Z) and end (2030-10-01T17:00:00.000Z) were all returned exactly as entered. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-review.e2e-spec.ts::returns name, purpose, description and proposed date & time` |

### TC-S1-04

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-04 |
| Story/AC ref | US-07 AC-3 (negative) |
| Test Scenario | Approve is refused for a request that is not ready to proceed (a draft, or a cancelled request) |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-02-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody clicks "Approve" on `e-draft`.<br>2. Cody clicks "Approve" on `e-cancelled`.<br>3. Read `e-draft` back. |
| Test Data | `e-draft` (DRAFT), `e-cancelled` (CANCELLED) |
| Expected Result | Approval is refused for both, and the draft stays a draft. Only a submitted request can be approved. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Both returned HTTP 409. `e-draft` is still DRAFT. |
| Status | Pass |
| Remarks | Conflict case: an illegal status transition. Approval requires an assigned Coordinator, consistent with Week 7 Change 5. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-review.e2e-spec.ts::refuses to approve a DRAFT`<br>`test/events-review.e2e-spec.ts::refuses to approve a CANCELLED request` |

### TC-S1-05

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-05 |
| Story/AC ref | US-07 AC-3 (boundary) |
| Test Scenario | Clicking "Approve" twice on the same request |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody clicks "Approve" on `e-submitted`.<br>2. Cody clicks "Approve" on it again.<br>3. Read the request back. |
| Test Data | Request `e-submitted` |
| Expected Result | The request is Approved. The second click neither errors nor changes the status. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 200 both times. The stored status is APPROVED. |
| Status | Pass |
| Remarks | Approval requires an assigned Coordinator, consistent with Week 7 Change 5. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-review.e2e-spec.ts::is idempotent — approving twice leaves it APPROVED` |

### TC-S1-06

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-06 |
| Story/AC ref | US-07 AC-3, with US-02 AC-3/AC-6 (permission) |
| Test Scenario | Only the Coordinator assigned to the request can approve it |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). `e-submitted` is assigned to Cody (coord.a@example.com). Logged in in turn as coord.b@example.com (Casey Coordinator), organiser@example.com and attendee@example.com. |
| Test Steps | 1. Casey (not assigned) calls Approve on `e-submitted` directly.<br>2. The Organiser calls Approve.<br>3. The Attendee calls Approve.<br>4. Read the request back after each attempt. |
| Test Data | Request `e-submitted` |
| Expected Result | Every attempt is denied, and the request stays Submitted. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Casey got HTTP 404; the Organiser and Attendee got HTTP 403. The status is still SUBMITTED each time. |
| Status | Pass |
| Remarks | Denied = 404 by design (agreed decision): a peer Coordinator gets 404 rather than 403, so the request's existence is not revealed. Approval requires an assigned Coordinator, consistent with Week 7 Change 5. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-review.e2e-spec.ts::refuses a Coordinator assigned to a different event`<br>`test/events-review.e2e-spec.ts::refuses %s at the role gate` (organiser, attendee) |

### TC-S1-07

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-07 |
| Story/AC ref | US-07 AC-3 with US-08 AC-3 (conflict) |
| Test Scenario | Approve and Reject are submitted for the same request at the same moment |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com in two sessions. |
| Test Steps | 1. Send "Approve" and "Reject" (reason "No") for `e-submitted` simultaneously.<br>2. Read the request back. |
| Test Data | Request `e-submitted`; reject reason "No" |
| Expected Result | Exactly one decision succeeds and the other is refused. The final status matches the decision that succeeded. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | — |
| Status | Not Executed |
| Remarks | Known bug, audit gap #2. A manual reproduction on 2026-10-14 had both calls return 200 in 9 of 10 runs, ending REJECTED after one caller was told APPROVED. Approval requires an assigned Coordinator, consistent with Week 7 Change 5. |
| Executed By | — |
| Date of Execution | — |
| Automated by | GAP |

**US-07 AC ↔ code mismatches**
- **AC-3 (resolved by Week 7 Change 5):** approving requires an assigned Coordinator. An unassigned request returns 409 "assign a coordinator to this request before reviewing it". That matches Change 5, where Coordinators can't review unassigned requests, so it's no longer a mismatch. TC-S1-01 to 07 state the assignment in their pre-conditions.
- **Permission (TC-S1-06), a decision rather than a mismatch:** a Coordinator who isn't assigned gets 404 rather than 403. "Denied = 404 by design" is an agreed team decision, so the request's existence isn't revealed.

---

## US-08 Reject or return a request with a reason (Event Coordinator)

### TC-S1-08

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-08 |
| Story/AC ref | US-08 AC-1, AC-3 |
| Test Scenario | Reject and Return are separate actions with different outcomes (happy path) |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-02-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. `e-submitted` and `e-submitted-2` are SUBMITTED and assigned to Cody. |
| Test Steps | 1. Cody chooses "Reject" on `e-submitted` with a reason.<br>2. Cody chooses "Return" on `e-submitted-2` with a reason.<br>3. Compare the two outcomes. |
| Test Data | Reject reason "Clashes with the examination period"; return reason "Please confirm the attendance figure" |
| Expected Result | The rejected request becomes "Rejected" and the returned one "Returned". The two actions are distinct. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Both returned HTTP 200, with statuses REJECTED and RETURNED respectively. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-decision.e2e-spec.ts::reject and return are different endpoints with different outcomes` |

### TC-S1-09

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-09 |
| Story/AC ref | US-08 AC-2 (negative) |
| Test Scenario | Confirming Reject or Return without entering a reason |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody confirms "Reject" on `e-submitted` with no reason field.<br>2. Cody confirms "Return" on `e-submitted` with no reason field.<br>3. Read the request back. |
| Test Data | Request body `{}` |
| Expected Result | Confirmation is prevented until a reason is entered. The request stays Submitted and no reason is saved. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 400 with "a reason is required to reject / return this request". The status is still SUBMITTED and `decisionReason` is null. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-decision.e2e-spec.ts::%s is blocked when the reason is missing` (reject, return)<br>`test/events-decision.e2e-spec.ts::nothing is written when the reason is missing` |

### TC-S1-10

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-10 |
| Story/AC ref | US-08 AC-2 (boundary) |
| Test Scenario | The reason is present but empty |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody confirms "Reject" with an empty reason.<br>2. Cody confirms "Return" with an empty reason.<br>3. Read the request back. |
| Test Data | reason `""` |
| Expected Result | Confirmation is prevented. An empty reason is not a reason. The request stays Submitted. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 400 for both. The status is still SUBMITTED. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-decision.e2e-spec.ts::%s is blocked when the reason is an empty string` (reject, return) |

### TC-S1-11

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-11 |
| Story/AC ref | US-08 AC-2 (boundary) |
| Test Scenario | The reason contains only spaces |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody confirms "Reject" with a reason of three spaces.<br>2. Cody confirms "Return" with a reason of three spaces.<br>3. Read the request back. |
| Test Data | reason `"   "` |
| Expected Result | Confirmation is prevented, because no reason has been entered. The request stays Submitted, with no reason saved. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Both were accepted: HTTP 200 instead of 400. That was observed directly on 2026-10-16, before the test was marked `it.failing`. Today's run confirms the 400 check still fails. |
| Status | Fail |
| Remarks | Known bug, audit gap #1: whitespace-only reasons are accepted. The test is marked `it.failing`, so the suite stays green until the trim fix lands. The fix is parked on `sprint3-raye-BACKUP`. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-decision.e2e-spec.ts::%s is blocked when the reason is whitespace-only` (reject, return; `it.failing`) |

### TC-S1-12

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-12 |
| Story/AC ref | US-08 AC-4 |
| Test Scenario | The decision and its reason are saved and retained with the request |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com, then as organiser@example.com. |
| Test Steps | 1. Cody rejects `e-submitted` with a reason.<br>2. The Organiser opens "My requests", then opens the request twice.<br>3. Repeat with "Return" and a different reason, then open the request as the Organiser. |
| Test Data | Reject reasons "Clashes with the examination period" and "Venue capacity insufficient"; return reason "Please confirm the attendance figure" |
| Expected Result | The decision (Rejected or Returned) and its reason are saved with the request, and stay visible on every later view. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | After the rejection, the list shows REJECTED with the reason, and two consecutive reads both return the same reason. After the return, the request shows RETURNED with `clarificationRequested: true` and the reason. |
| Status | Pass |
| Remarks | Three separate tests, each starting from a fresh reset. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-decision.e2e-spec.ts::shows the rejection reason in the Organiser’s view (US-05 AC-2)`<br>`test/events-decision.e2e-spec.ts::retains the reason across later reads`<br>`test/events-decision.e2e-spec.ts::shows the return reason as an outstanding clarification (US-05 AC-3)` |

### TC-S1-13

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-13 |
| Story/AC ref | US-08 AC-1 (conflict) |
| Test Scenario | A rejected request cannot then be returned or amended |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com and organiser@example.com. |
| Test Steps | 1. Cody rejects `e-submitted`.<br>2. Cody then tries "Return" on it.<br>3. Separately, after a rejection, the Organiser tries to edit the request. |
| Test Data | Reject reason "No"; return reason "Changed my mind"; edit purpose "Trying to edit" |
| Expected Result | The Return is refused and the request stays Rejected. The Organiser cannot amend a rejected request. Each option is a separate, final action. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The Return after Reject got HTTP 409, and the edit after Reject got HTTP 409. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-decision.e2e-spec.ts::a rejected request cannot then be returned`<br>`test/events-decision.e2e-spec.ts::rejecting does not leave the request amendable` |

### TC-S1-14

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-14 |
| Story/AC ref | US-08 AC-1, with US-02 AC-3/AC-6 (permission) |
| Test Scenario | Only the assigned Coordinator can reject or return the request |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). `e-submitted` is assigned to Cody. Logged in in turn as coord.b@example.com, organiser@example.com and attendee@example.com. |
| Test Steps | 1. Casey (not assigned) tries "Reject", then "Return", on `e-submitted`.<br>2. The Organiser and the Attendee each try "Reject". |
| Test Data | Reasons "Not mine to decide" and "Trying it on" |
| Expected Result | Every attempt is denied, and the request is unchanged. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Casey got HTTP 404 for both reject and return. The Organiser and Attendee got HTTP 403. |
| Status | Pass |
| Remarks | Denied = 404 by design (agreed decision), as in TC-S1-06. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-decision.e2e-spec.ts::%s refuses a Coordinator assigned elsewhere` (reject, return)<br>`test/events-decision.e2e-spec.ts::refuses %s at the role gate` (organiser, attendee) |

**US-08 AC ↔ code mismatches**
- **AC-2:** a whitespace-only reason is accepted (TC-S1-11, audit gap #1).
- **AC-4, a note only:** a return's reason is stored as the outstanding clarification (`clarificationRequest`), while a rejection's is stored as `decisionReason`. Both are saved and shown, so the AC is met.

---

## US-09 Request clarification from the Organiser through the system (Event Coordinator)

### TC-S1-15

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-15 |
| Story/AC ref | US-09 AC-1 (UI) |
| Test Scenario | The clarification form offers a text field for the question |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in to the web app as coord.a@example.com. |
| Test Steps | 1. Open request `e-submitted`.<br>2. Choose "Request clarification" as the decision. |
| Test Data | — |
| Expected Result | A text field is shown for entering the clarification question. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | — |
| Status | Not Executed |
| Remarks | This AC is about the user interface. |
| Executed By | — |
| Date of Execution | — |
| Automated by | Playwright (pending) |

### TC-S1-16

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-16 |
| Story/AC ref | US-09 AC-1, AC-2 |
| Test Scenario | Coordinator submits a free-text question, which is saved against its request (happy path) |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody submits a clarification question on `e-submitted`.<br>2. Look up the clarification messages for `e-submitted`. |
| Test Data | "Can you confirm the expected attendance?" and "Which venue did you have in mind?" |
| Expected Result | The question is accepted and saved, tied to request `e-submitted`, with Cody as its author. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 201 with the question as the outstanding clarification. Exactly one message is stored for `e-submitted`, with the same text and Cody as author. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-clarification.e2e-spec.ts::accepts a free-text question`<br>`test/events-clarification.e2e-spec.ts::stores the message against the event` |

### TC-S1-17

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-17 |
| Story/AC ref | US-09 AC-1 (negative) |
| Test Scenario | Submitting the clarification form with no question |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody submits an empty question.<br>2. Cody submits the form with no question field at all. |
| Test Data | question `""`; body `{}` |
| Expected Result | The submission is refused with a clear message. No question is recorded. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 400 with "a question is required to request clarification" for the empty question, and HTTP 400 for the missing field. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-clarification.e2e-spec.ts::requires the question to be non-empty`<br>`test/events-clarification.e2e-spec.ts::rejects a missing question entirely` |

### TC-S1-18

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-18 |
| Story/AC ref | US-09 AC-1 (boundary) |
| Test Scenario | The clarification question contains only spaces |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody submits a question of three spaces on `e-submitted`.<br>2. Read the request back. |
| Test Data | question `"   "` |
| Expected Result | The submission is refused, because no question has been entered. The request stays Submitted. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | — |
| Status | Not Executed |
| Remarks | Expected to fail: audit gap #1 (whitespace-only text is accepted). A DTO-level check on 2026-10-14 confirmed `"   "` passes validation. No integration test exists yet. |
| Executed By | — |
| Date of Execution | — |
| Automated by | GAP |

### TC-S1-19

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-19 |
| Story/AC ref | US-09 AC-3 |
| Test Scenario | After a question is asked, both parties see the status "Awaiting Clarification" |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com and organiser@example.com. |
| Test Steps | 1. Cody asks a question on `e-submitted`.<br>2. Read the stored status.<br>3. The Organiser opens the request.<br>4. Cody opens the request. |
| Test Data | Question "Can you confirm the attendance?" |
| Expected Result | The request status updates to "Awaiting Clarification", visible to both the Coordinator and the Organiser. The Organiser can also see what is being asked. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The stored status is AWAITING_CLARIFICATION. The Organiser's view shows that status with `clarificationRequested: true` and the question. The Coordinator's view shows the same status. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-clarification.e2e-spec.ts::updates the stored status`<br>`test/events-clarification.e2e-spec.ts::is visible to the Organiser`<br>`test/events-clarification.e2e-spec.ts::is visible to the Coordinator` |

### TC-S1-20

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-20 |
| Story/AC ref | US-09 AC-4 |
| Test Scenario | When the Organiser responds, the Coordinator is notified |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com and organiser@example.com. |
| Test Steps | 1. Cody asks a question on `e-submitted`.<br>2. The Organiser submits a response.<br>3. Check Cody's notifications. |
| Test Data | Response "We expect 320 attendees" |
| Expected Result | The Coordinator is notified that the Organiser has responded on this request. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | — (not recorded; see Remarks) |
| Status | Not Executed |
| Remarks | Notifications in progress (Sprint 3 story: Be Notified of My Request Outcome). The linked test currently checks only that a CLARIFICATION_ANSWERED notification record is stored for the Coordinator. It passed on 2026-10-17, but that is not yet the notification the AC describes. |
| Executed By | — |
| Date of Execution | — |
| Automated by | `test/events-clarification.e2e-spec.ts::notifies the Coordinator when the Organiser responds` |

### TC-S1-21

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-21 |
| Story/AC ref | US-09 AC-5 |
| Test Scenario | Both parties see the whole exchange as a timestamped audit trail, with sender and time |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com and organiser@example.com. |
| Test Steps | 1. Cody asks Q1, the Organiser answers A1, Cody asks Q2, and the Organiser answers A2.<br>2. The Organiser opens the request.<br>3. Cody opens the request. |
| Test Data | "Q1: how many attendees?", "A1: 320", "Q2: any accessibility needs?", "A2: hearing loop" |
| Expected Result | All questions and responses are shown in order, each with its sender and time, to both the Coordinator and the Organiser. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The Organiser sees all 4 entries in order. Each entry names its author (id, role and email), every entry has a valid timestamp, and the timestamps are ascending. The Coordinator sees the same trail. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-clarification.e2e-spec.ts::shows the full exchange to the Organiser`<br>`test/events-clarification.e2e-spec.ts::identifies the sender of each entry`<br>`test/events-clarification.e2e-spec.ts::timestamps every entry, in chronological order`<br>`test/events-clarification.e2e-spec.ts::shows the same exchange to the Coordinator` |

### TC-S1-22

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-22 |
| Story/AC ref | US-09 AC-2/AC-4, with US-02 AC-5/AC-6 (permission) |
| Test Scenario | Only the assigned Coordinator can ask, and only the owning Organiser can answer |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql + tc-s1-22-setup.sql on testDB (reset before test). `e-submitted` is owned by organiser@example.com and assigned to Cody. Logged in as coord.b@example.com (not assigned) and other@example.com (a different Organiser). |
| Test Steps | 1. Casey tries to ask a question on `e-submitted`.<br>2. Cody asks a question.<br>3. Otto (other@example.com) tries to answer it. |
| Test Data | Question "Q?"; Otto's response "Not mine" |
| Expected Result | Both attempts are denied. Neither Casey nor Otto can take part in this request's clarification thread. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Casey got HTTP 404 and Otto got HTTP 404. |
| Status | Pass |
| Remarks | Denied = 404 by design (agreed decision), as in TC-S1-06. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-clarification.e2e-spec.ts::refuses a Coordinator who is not assigned`<br>`test/events-clarification.e2e-spec.ts::refuses a response from another Organiser` |

**US-09 AC ↔ code mismatches**
- **AC-1:** a whitespace-only question is accepted (TC-S1-18, audit gap #1).
- **AC-4:** "the Coordinator is notified" is only met by storing a notification record today. Nothing is delivered (no email, push or in-app feed). TC-S1-20 stays Not Executed until the Sprint 3 story "Be Notified of My Request Outcome" lands.

---

## US-03 Submit a new event request (Event Organiser)

### TC-S1-23

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-23 |
| Story/AC ref | US-03 AC-1 |
| Test Scenario | Organiser submits a complete, valid request (happy path) |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia fills in every required field and submits (`POST /events`).<br>2. Read the stored request back. |
| Test Data | Name "Freshman Orientation 2030"; purpose "Welcome new students and introduce campus services"; category "Student engagement"; 2030-10-01 09:00–17:00 UTC; attendance 300 |
| Expected Result | The request is submitted and recorded with status "Submitted", against the Organiser who submitted it. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 201 with status SUBMITTED and a new id. The stored record is SUBMITTED, with organiserId u-organiser. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-submit.e2e-spec.ts::returns 201 with status SUBMITTED`<br>`test/events-submit.e2e-spec.ts::persists the record against the calling organiser` |

### TC-S1-24

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-24 |
| Story/AC ref | US-03 AC-2 (confirmation) |
| Test Scenario | The Organiser receives confirmation of a successful submission |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits a complete request.<br>2. Inspect the response. |
| Test Data | The same payload as TC-S1-23 |
| Expected Result | The Organiser receives confirmation that the request was created, including its reference and status. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 201 returned the persisted request: every submitted field, its id, status SUBMITTED, and createdAt. |
| Status | Pass |
| Remarks | Confirmation is read as the API response the UI shows. If the team means a separate notification, this belongs to the Sprint 3 notifications story. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-submit.e2e-spec.ts::returns the persisted request as confirmation` |

### TC-S1-25

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-25 |
| Story/AC ref | US-03 AC-2 (visibility), updated for Week 7 Change 5 |
| Test Scenario | A newly submitted request appears in the Event Coordinator Lead's unassigned queue, and not to Coordinators |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com, then as the Event Coordinator Lead and as coord.a@example.com. |
| Test Steps | 1. Olivia submits a complete request.<br>2. The Lead opens the unassigned queue.<br>3. Cody (Coordinator) lists events and tries to open the request. |
| Test Data | The same payload as TC-S1-23 |
| Expected Result | The request appears in the Lead's unassigned queue for assignment. Coordinators can't review or edit it until it is assigned to them. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | — |
| Status | Not Executed |
| Remarks | Pending Change 5 merge. Today any Coordinator sees unassigned submissions in a shared pool. `events-submit.e2e-spec.ts::makes the request visible to a Coordinator for review` asserts that old behaviour, so it is not cited here. |
| Executed By | — |
| Date of Execution | — |
| Automated by | GAP |

### TC-S1-26

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-26 |
| Story/AC ref | US-03 AC-3 (negative) |
| Test Scenario | Submission with missing or invalid fields is blocked, and each field is flagged |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits with a start date in the past.<br>2. Olivia submits with attendance "three hundred".<br>3. Olivia submits with the end time before the start time.<br>4. Olivia submits with no category.<br>5. Olivia submits with several fields wrong at once.<br>6. Check no request was stored. |
| Test Data | proposedStart 2020-01-01T09:00Z; expectedAttendance "three hundred"; start 17:00 and end 09:00; category omitted |
| Expected Result | Submission is blocked. Each offending field is flagged with a clear message (past date, non-numeric attendance, end before start, missing category), all at once. Nothing is recorded. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 400 each time, with "proposedStart must be in the future", "expectedAttendance must be a whole number", "proposedEnd must be later than proposedStart" and "category is required". The combined case flags all five fields together. The request count stayed 0. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-submit.e2e-spec.ts::rejects a date in the past`<br>`test/events-submit.e2e-spec.ts::rejects non-numeric attendance`<br>`test/events-submit.e2e-spec.ts::rejects an end time before the start time, flagging proposedEnd`<br>`test/events-submit.e2e-spec.ts::rejects a missing category`<br>`test/events-submit.e2e-spec.ts::flags EVERY offending field at once, not just the first`<br>`test/events-submit.e2e-spec.ts::persists nothing when validation fails` |

### TC-S1-27

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-27 |
| Story/AC ref | US-03 AC-3 (boundary) |
| Test Scenario | Values at the edge of valid are handled correctly |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits with the end equal to the start.<br>2. Olivia submits with a start one minute in the past.<br>3. Olivia submits with attendance exactly 1.<br>4. Olivia submits with a name and purpose of only spaces. |
| Test Data | start = end = 2030-10-01T09:00Z; start = now − 1 min; expectedAttendance 1; name "   ", purpose "  " |
| Expected Result | Blocked: the end equals the start, the start is in the past, and the blank (whitespace) required fields are flagged. Accepted: attendance of 1. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | — |
| Status | Not Executed |
| Remarks | No integration test covers these boundaries (audit G4). The whitespace case is expected to fail: audit gap #1 (whitespace-only text is accepted). |
| Executed By | — |
| Date of Execution | — |
| Automated by | GAP |

### TC-S1-28

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-28 |
| Story/AC ref | US-03 AC-4 |
| Test Scenario | After submitting, the Organiser sees every detail accurately with the current status |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits a complete request.<br>2. Olivia opens it (`GET /events/<id>`).<br>3. Olivia lists her requests. |
| Test Data | The same payload as TC-S1-23 |
| Expected Result | All entered details are displayed accurately and the current status is shown. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Every submitted field matched, including start and end to the millisecond. The list contained exactly one request, with status SUBMITTED. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-submit.e2e-spec.ts::returns each submitted field accurately`<br>`test/events-submit.e2e-spec.ts::lists it among the organiser’s own requests` |

### TC-S1-29

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-29 |
| Story/AC ref | US-03 AC-5 (+ boundary) |
| Test Scenario | Expected attendance is stored as a positive whole number |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits with attendance 420.<br>2. Olivia submits with attendance "250" (a numeric string).<br>3. Olivia submits with 0, then −5.<br>4. Olivia submits with 12.5. |
| Test Data | 420; "250"; 0; −5; 12.5 |
| Expected Result | Valid attendance is stored as a positive whole number. Zero, negative and fractional values are refused. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | 420 was stored as the integer 420 (> 0). "250" was stored as the number 250. 0 and −5 got 400 "expectedAttendance must be greater than zero", and 12.5 got 400 "must be a whole number". |
| Status | Pass |
| Remarks | The at-boundary value of 1 is not yet tested (see TC-S1-27). |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-submit.e2e-spec.ts::round-trips the value as a number`<br>`test/events-submit.e2e-spec.ts::accepts a numeric string and stores it as a number`<br>`test/events-submit.e2e-spec.ts::rejects zero and negative attendance (AC-5)`<br>`test/events-submit.e2e-spec.ts::rejects a fractional attendance` |

### TC-S1-30

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-30 |
| Story/AC ref | US-03 AC-1/AC-4, with US-02 AC-5 (permission) |
| Test Scenario | A submitted request belongs only to its Organiser |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql on testDB (reset before test). Logged in as organiser@example.com and other@example.com (Otto Organiser). |
| Test Steps | 1. Olivia submits a request with organiserId set to Otto's id and status APPROVED in the body.<br>2. Olivia submits a normal request, and Otto lists his events.<br>3. Otto opens Olivia's request by id. |
| Test Data | organiserId u-organiser-2, status "APPROVED" in the payload |
| Expected Result | The client can't choose the owner or the status: the request belongs to Olivia and is Submitted. Another Organiser can't see or open it. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The forged fields were ignored: organiserId u-organiser, status SUBMITTED. Otto's list was empty, and opening the request gave HTTP 404. |
| Status | Pass |
| Remarks | Denied = 404 by design (agreed decision): the request's existence is not revealed. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-submit.e2e-spec.ts::ignores a client-supplied organiserId or status`<br>`test/events-submit.e2e-spec.ts::does not expose it to a different Organiser`<br>`test/events-submit.e2e-spec.ts::denies another Organiser the record by id` |

**US-03 AC ↔ code mismatches**
- **AC-2 (Week 7 Change 5):** new submissions currently land in a pool that every Coordinator can see and review. Change 5 sends them to the Lead's unassigned queue instead (TC-S1-25).
- **AC-3:** whitespace-only required text is accepted (audit gap #1). The end-equals-start and "just past" boundaries are untested (TC-S1-27).

---

## US-04 Save an incomplete request as a draft (Event Organiser)

### TC-S1-31

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-31 |
| Story/AC ref | US-04 AC-1 (+ boundary) |
| Test Scenario | Saving an incomplete draft skips full submission validation, but not basic sanity checks |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia saves a draft with no fields.<br>2. Olivia saves a draft with only a name.<br>3. Olivia saves a draft with a start date in the past.<br>4. Olivia saves a draft with attendance "not a number", then one with the end before the start. |
| Test Data | {}; name "Work in progress"; proposedStart 2020-01-01; expectedAttendance "not a number" |
| Expected Result | An incomplete draft saves as a Draft with the empty fields left empty, and a past date is accepted on a draft. Values of the wrong type are still refused. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The empty draft and the name-only draft got HTTP 201 with status DRAFT (purpose and attendance null). The past-date draft got 201. "not a number" got 400, and end before start got 400. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-draft.e2e-spec.ts::accepts a completely empty draft`<br>`test/events-draft.e2e-spec.ts::accepts a draft with required fields still empty`<br>`test/events-draft.e2e-spec.ts::accepts a date in the past, which submission would reject`<br>`test/events-draft.e2e-spec.ts::still rejects incoherent data` |

### TC-S1-32

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-32 |
| Story/AC ref | US-04 AC-2 |
| Test Scenario | The Organiser returns later, opens the draft and continues editing |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia saves a draft with a name and purpose.<br>2. Later, she opens it.<br>3. She adds the purpose to a name-only draft (`PATCH`) and reopens it. |
| Test Data | name "Half done", purpose "Partly written"; later purpose "Added on the second visit" |
| Expected Result | The draft opens with what was entered, and the missing fields can be filled in, with earlier values kept. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Reopening returned name and purpose as saved. The PATCH got 200, and the reopened draft kept "Half done" with the new purpose. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-draft.e2e-spec.ts::opens the saved draft with what was entered`<br>`test/events-draft.e2e-spec.ts::fills in the missing fields incrementally` |

### TC-S1-33

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-33 |
| Story/AC ref | US-04 AC-3 (data) |
| Test Scenario | In the request list, a draft is marked "Draft" and a submitted request "Submitted" |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia saves one draft and submits one complete request.<br>2. She lists her requests. |
| Test Data | Draft "Still a draft"; submitted "Freshman Orientation 2030" |
| Expected Result | The draft is clearly marked as Draft, distinct from the request submitted for review. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The list had 2 requests: "Still a draft" was DRAFT and the other SUBMITTED. |
| Status | Pass |
| Remarks | The visual styling is covered by TC-S1-34. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-draft.e2e-spec.ts::marks a draft DRAFT and a submitted request SUBMITTED` |

### TC-S1-34

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-34 |
| Story/AC ref | US-04 AC-3 (UI) |
| Test Scenario | The draft is visually distinguishable from submitted requests |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-02-setup.sql on testDB (reset before test). The Organiser has, among others, `e-draft` (DRAFT) and `e-submitted` (SUBMITTED). Logged in to the web app as organiser@example.com. |
| Test Steps | 1. Olivia opens "My requests". |
| Test Data | `e-draft` and `e-submitted` |
| Expected Result | The draft is clearly marked "Draft" and looks different from requests already submitted for review. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | — |
| Status | Not Executed |
| Remarks | This AC is about the user interface. |
| Executed By | — |
| Date of Execution | — |
| Automated by | Playwright (pending) |

### TC-S1-35

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-35 |
| Story/AC ref | US-04 AC-4 |
| Test Scenario | Completing a draft and submitting it changes its status from Draft to Submitted |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia saves a complete draft.<br>2. She submits it (`POST /events/<id>/submit`). |
| Test Data | A draft with all required fields |
| Expected Result | The status changes from "draft" to "submitted". |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Saved as DRAFT, then submit returned HTTP 200 with status SUBMITTED. |
| Status | Pass |
| Remarks | Visibility to reviewers after submission follows Week 7 Change 5 (see TC-S1-25). `events-draft.e2e-spec.ts::makes it visible to a Coordinator once submitted` asserts the old pool behaviour, so it is not cited. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-draft.e2e-spec.ts::moves DRAFT -> SUBMITTED` |

### TC-S1-36

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-36 |
| Story/AC ref | US-04 AC-4 (negative) |
| Test Scenario | Submitting a draft that is still incomplete, or whose date has passed, is blocked |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia saves a name-only draft and tries to submit it.<br>2. She saves a complete draft dated in the past and tries to submit it. |
| Test Data | name "Only a name"; proposedStart 2020-01-01 |
| Expected Result | Submission is blocked and each missing or invalid field is flagged. The request stays a Draft. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 400 naming purpose, category and expectedAttendance, with the stored status still DRAFT. The past-dated draft got 400 "proposedStart must be in the future". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-draft.e2e-spec.ts::blocks submitting an incomplete draft and flags each missing field`<br>`test/events-draft.e2e-spec.ts::blocks submitting a draft whose date has since passed` |

### TC-S1-37

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-37 |
| Story/AC ref | US-04 AC-5 (conflict) |
| Test Scenario | A request that has been submitted no longer behaves as an editable draft |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits a request.<br>2. She tries to edit it.<br>3. She checks the stored record.<br>4. She tries to submit it again.<br>5. She opens it. |
| Test Data | Edit name "Changed after submission" |
| Expected Result | The submitted request can't be edited or re-submitted as a draft, and is still shown with its status. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Edit got HTTP 409 (message names SUBMITTED), and the stored name was unchanged. Re-submit got 409. Opening it returned status SUBMITTED. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-draft.e2e-spec.ts::refuses to edit it`<br>`test/events-draft.e2e-spec.ts::leaves the stored record untouched after a refused edit`<br>`test/events-draft.e2e-spec.ts::refuses to submit it again`<br>`test/events-draft.e2e-spec.ts::still shows it, with its status` |

### TC-S1-38

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-38 |
| Story/AC ref | US-04 AC-2/AC-4, with US-02 AC-5 (permission) |
| Test Scenario | Another Organiser cannot edit or submit someone else's draft |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql on testDB (reset before test). Logged in as organiser@example.com and other@example.com. |
| Test Steps | 1. Olivia saves a draft.<br>2. Otto tries to edit it.<br>3. Otto tries to submit it. |
| Test Data | Draft "Mine"; Otto's edit name "Hijacked" |
| Expected Result | Both attempts are denied and the draft is unchanged. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Edit got HTTP 404 and the stored name is still "Mine". Submit got 404. |
| Status | Pass |
| Remarks | Denied = 404 by design (agreed decision): the request's existence is not revealed. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-draft.e2e-spec.ts::refuses to edit another Organiser’s draft`<br>`test/events-draft.e2e-spec.ts::refuses to submit another Organiser’s draft` |

**US-04 AC ↔ code mismatches**
- None in behaviour. AC-3's visual part is pending Playwright (TC-S1-34).
- One test asserts the pre-Change-5 pool (`makes it visible to a Coordinator once submitted`) and will need updating when Change 5 merges.

---

## US-05 View current status of my event request (Event Organiser)

### TC-S1-39

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-39 |
| Story/AC ref | US-05 AC-1 |
| Test Scenario | Each of the Organiser's requests displays its current status, for every status |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-39-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia lists her requests (`GET /events/mine`). |
| Test Data | 12 requests named "Request <STATUS>", one per status |
| Expected Result | Each request displays its current status (draft, submitted, under review, approved, rejected, planning, confirmed, completed, cancelled, and the other lifecycle statuses). |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | All 12 requests were listed, each with the status matching its name. |
| Status | Pass |
| Remarks | Covers the 9 statuses AC-1 lists, plus AWAITING_CLARIFICATION, RETURNED and AWAITING_ARRANGEMENTS. When Change 6 adds a safety-check status, add its row to tc-s1-39-setup.sql. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-status-view.e2e-spec.ts::reports every status in the lifecycle` |

### TC-S1-40

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-40 |
| Story/AC ref | US-05 AC-1 (boundary) |
| Test Scenario | An Organiser with no requests sees an empty list |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia lists her requests. |
| Test Data | No requests |
| Expected Result | An empty list is shown, not an error. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 200 with `[]`. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-status-view.e2e-spec.ts::returns an empty list when the Organiser has none` |

### TC-S1-41

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-41 |
| Story/AC ref | US-05 AC-2 |
| Test Scenario | A rejected request shows the Coordinator's reason |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-41-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia lists her requests.<br>2. Olivia opens `e-rejected-direct`. |
| Test Data | `e-rejected-latest` "Clashes with the examination period"; `e-rejected-direct` "Venue capacity insufficient" |
| Expected Result | The rejected request shows its status and the reason the Coordinator gave, in the list and when opened. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The first list entry was REJECTED with "Clashes with the examination period". Opening `e-rejected-direct` showed "Venue capacity insufficient". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-status-view.e2e-spec.ts::includes decisionReason on a rejected request`<br>`test/events-status-view.e2e-spec.ts::includes it when opening the request directly` |

### TC-S1-42

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-42 |
| Story/AC ref | US-05 AC-3 |
| Test Scenario | When the Coordinator has asked for clarification, the Organiser sees that, and what is asked |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-42-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia lists her requests. |
| Test Data | `e-draft-asked` "Please confirm the expected attendance figure"; `e-draft-returned` "Which venue did you have in mind?"; `e-draft-plain` no question |
| Expected Result | Requests awaiting clarification show that clarification is needed and the question asked. A plain draft shows no clarification. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The first entry was flagged `clarificationRequested: true`, with its question. "Returned for clarification" was flagged true and "Plain draft" false. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-status-view.e2e-spec.ts::flags clarification and shows what is asked`<br>`test/events-status-view.e2e-spec.ts::distinguishes a returned request from an ordinary draft` |

### TC-S1-43

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-43 |
| Story/AC ref | US-05 AC-3 (negative) |
| Test Scenario | No clarification is shown when none was asked |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia lists her requests. |
| Test Data | `e-submitted` with no question |
| Expected Result | The request shows no clarification flag and no question. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | `clarificationRequested: false` and `clarificationRequest: null`. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-status-view.e2e-spec.ts::reports no clarification when none was asked` |

### TC-S1-44

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-44 |
| Story/AC ref | US-05 AC-4 |
| Test Scenario | After a status change, the next view shows the most recent valid state |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia saves a complete draft and lists her requests.<br>2. She submits it through the real submit endpoint.<br>3. She lists her requests again. |
| Test Data | A complete draft |
| Expected Result | The displayed status reflects the latest valid state: Draft before, Submitted after. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | DRAFT before and SUBMITTED after. |
| Status | Pass |
| Remarks | The AC's own example (submitted → under review) has no Coordinator action that sets UNDER_REVIEW on first review (see mismatches). That transition is covered by the non-showcase test "reflects a later submitted -> under review change", which writes the status directly. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-status-view.e2e-spec.ts::reflects a transition made through the real submit endpoint` |

### TC-S1-45

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-45 |
| Story/AC ref | US-05 AC-4 (boundary) |
| Test Scenario | A repeated read after a change does not serve a stale, cached status |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-45-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia lists her requests (`e-approved-only` is APPROVED).<br>2. The request moves to PLANNING.<br>3. Olivia lists her requests again. |
| Test Data | `e-approved-only` APPROVED → PLANNING |
| Expected Result | The second read shows the new status, not the earlier one. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The second read returned PLANNING. |
| Status | Pass |
| Remarks | The status change is applied directly to the record, standing in for the planning story's action. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-status-view.e2e-spec.ts::does not serve a stale status on a repeated read` |

### TC-S1-46

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-46 |
| Story/AC ref | US-05 AC-5 (permission) |
| Test Scenario | Requests belonging to another Organiser never appear, and can't be opened |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql + tc-s1-46-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia lists her requests.<br>2. Olivia opens Otto's request `e-theirs` by id.<br>3. Olivia lists again and opens Otto's rejected request `e-theirs-rejected`. |
| Test Data | `e-mine` (Olivia); `e-theirs` and `e-theirs-rejected` "CONFIDENTIAL internal note" (Otto) |
| Expected Result | Only Olivia's own request appears. Otto's requests and their reasons are never shown. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The list had exactly 1 entry, "Mine". Opening `e-theirs` gave HTTP 404 with no name in the body. "CONFIDENTIAL" appeared in neither the list nor the 404 body. |
| Status | Pass |
| Remarks | Denied = 404 by design (agreed decision): the request's existence is not revealed. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-status-view.e2e-spec.ts::excludes them from the list`<br>`test/events-status-view.e2e-spec.ts::denies fetching another Organiser’s request by id`<br>`test/events-status-view.e2e-spec.ts::does not leak a rejection reason belonging to someone else` |

**US-05 AC ↔ code mismatches**
- **AC-4:** the AC's example is "submitted → under review", but no Coordinator action currently moves a newly submitted request to UNDER_REVIEW. It only happens after a clarification answer. TC-S1-44 uses the real draft → submitted transition instead. Is there meant to be a "start review" step? Confirm with the team.
- **AC-1** lists 9 statuses, and the system has 12. Week 7 Change 6 will add a safety-check status, and TC-S1-39's script must gain a row for it.

---

## US-06 Specify preferred room layout and accessibility requirements (Event Organiser)

### TC-S1-47

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-47 |
| Story/AC ref | US-06 AC-1 |
| Test Scenario | The Organiser selects a preferred layout from the predefined list |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits a request with each listed layout in turn. |
| Test Data | THEATRE, CLASSROOM, BANQUET, BOARDROOM |
| Expected Result | Each predefined layout can be selected and is saved with the request. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 201 for each, with preferredLayout echoed back. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-layout.e2e-spec.ts::accepts %s` |

### TC-S1-48

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-48 |
| Story/AC ref | US-06 AC-1 (negative) |
| Test Scenario | A layout outside the predefined list is refused |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits with layout "CABARET".<br>2. She submits with a free-text layout. |
| Test Data | "CABARET"; "theatre style-ish" |
| Expected Result | The value is refused and the valid options are named. Free text belongs in the notes, not the layout field. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Both got HTTP 400. The first message named "preferredLayout must be one of: THEATRE, CLASSROOM, BANQUET, BOARDROOM…". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-layout.e2e-spec.ts::rejects a layout outside the list and names the valid options`<br>`test/events-layout.e2e-spec.ts::rejects a free-text layout, which belongs in layoutNotes` |

### TC-S1-49

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-49 |
| Story/AC ref | US-06 AC-2 |
| Test Scenario | Optional free-text layout notes alongside, or instead of, a selection |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits with layout THEATRE and a note.<br>2. She submits with a note and no layout. |
| Test Data | "…centre aisle…"; "Cabaret, eight to a table" |
| Expected Result | The notes are saved alongside the selection, or on their own when no listed layout fits. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | THEATRE was saved with the note. With no selection, preferredLayout was null and the "Cabaret" note was saved. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-layout.e2e-spec.ts::stores notes with a selection`<br>`test/events-layout.e2e-spec.ts::stores notes with no selection, for a layout not on the list` |

### TC-S1-50

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-50 |
| Story/AC ref | US-06 AC-3 |
| Test Scenario | The Organiser records accessibility requirements, with optional notes |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits with several requirements.<br>2. She submits with a requirement and notes.<br>3. She submits with the newer list entries.<br>4. She submits with notes only. |
| Test Data | e.g. STEP_FREE_ACCESS, HEARING_LOOP; ACCESSIBLE_RESTROOMS + "…same floor…"; notes "Quiet room…" |
| Expected Result | Accessibility requirements and notes are recorded as entered. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Every requirement list was saved exactly, the notes were saved, and notes-only saved with an empty list. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-layout.e2e-spec.ts::records multiple requirements`<br>`test/events-layout.e2e-spec.ts::records requirements with notes`<br>`test/events-layout.e2e-spec.ts::accepts the newer features added to the list`<br>`test/events-layout.e2e-spec.ts::accepts notes with no structured requirement selected` |

### TC-S1-51

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-51 |
| Story/AC ref | US-06 AC-3 (negative) |
| Test Scenario | Unknown or repeated accessibility requirements are refused |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits with an unknown requirement.<br>2. She submits with a requirement listed twice. |
| Test Data | ["STEP_FREE_ACCESS", "TELEPORTER"]; a duplicated entry |
| Expected Result | The request is refused, with a message naming the allowed requirements. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Both got HTTP 400, the first with "accessibilityRequirements must contain only…". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-layout.e2e-spec.ts::rejects an unrecognised requirement`<br>`test/events-layout.e2e-spec.ts::rejects duplicates` |

### TC-S1-52

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-52 |
| Story/AC ref | US-06 AC-4 |
| Test Scenario | Layout and accessibility values persist on a draft and after submission, and when reopened |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia saves a draft with layout and accessibility, then reopens it.<br>2. She submits the draft and reopens it.<br>3. She changes the layout on a draft and reopens it. |
| Test Data | THEATRE + requirements + notes; then BOARDROOM |
| Expected Result | The values persist with the request and are visible on reopening, whether saved as a draft or submitted. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The reopened draft matched. After submit, the values were unchanged. The edited draft showed BOARDROOM. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-layout.e2e-spec.ts::persists on a draft and is there when reopened`<br>`test/events-layout.e2e-spec.ts::survives the draft being submitted`<br>`test/events-layout.e2e-spec.ts::can be edited on a draft before submission` |

### TC-S1-53

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-53 |
| Story/AC ref | US-06 AC-5 |
| Test Scenario | Leaving layout and accessibility empty does not block saving or submission |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits a complete request with neither set.<br>2. She saves an empty draft.<br>3. She submits a completed draft without them. |
| Test Data | No layout or accessibility fields |
| Expected Result | The request still saves and submits. These are preferences, not blockers. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Submitted (201, SUBMITTED) with layout null, notes null and requirements `[]`. The empty draft saved. The draft submitted with HTTP 200. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-layout.e2e-spec.ts::submits a request with neither recorded`<br>`test/events-layout.e2e-spec.ts::saves an empty draft with neither recorded`<br>`test/events-layout.e2e-spec.ts::submits a completed draft that omits them` |

### TC-S1-54

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-54 |
| Story/AC ref | US-06 AC-6, updated for Week 7 Change 5 |
| Test Scenario | The assigned Coordinator opens the submitted request and sees the layout and accessibility values |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-54-setup.sql on testDB (reset before test). Request `e-with-preferences` is SUBMITTED, assigned to coord.a@example.com, with layout THEATRE and accessibility STEP_FREE_ACCESS and HEARING_LOOP. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody opens the request assigned to him. |
| Test Data | THEATRE; STEP_FREE_ACCESS, HEARING_LOOP; notes "Ramp access to the stage" |
| Expected Result | The layout and accessibility values the Organiser entered are visible to the reviewing Coordinator. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | — |
| Status | Not Executed |
| Remarks | The two US-06 AC-6 tests in `events-layout.e2e-spec.ts` read an unassigned request from the shared pool. Week 7 Change 5 removes that, so they are not cited. The assigned-Coordinator path is tested in `events-coordinator-view.e2e-spec.ts` ("returns the venue requirements", "returns the accessibility needs"), and will be linked, loading tc-s1-54-setup.sql, when that file is converted in group 3. |
| Executed By | — |
| Date of Execution | — |
| Automated by | GAP |

**US-06 AC ↔ code mismatches**
- **AC-6 (Week 7 Change 5):** the existing AC-6 tests rely on a Coordinator reading an unassigned request (TC-S1-54). They will need updating when Change 5 merges.

---

## Gaps (no automated test yet)

| Test case | Story/AC | What's missing |
|---|---|---|
| TC-S1-07 | US-07 AC-3, US-08 AC-3 | A concurrency test: simultaneous approve and reject (audit gap #2) |
| TC-S1-18 | US-09 AC-1 | An integration test for a whitespace-only question (audit gap #1) |
| TC-S1-15 | US-09 AC-1 (UI) | A Playwright check that the clarification text field exists (planned E2E session) |
| TC-S1-25 | US-03 AC-2 | A test that a new submission appears in the Lead's unassigned queue and not to Coordinators. Pending the Change 5 merge. |
| TC-S1-27 | US-03 AC-3 | Boundary tests: end = start, start just past, attendance = 1, whitespace-only name (gap #1) |
| TC-S1-34 | US-04 AC-3 (UI) | A Playwright check that a draft is visually distinguishable (planned E2E session) |
| TC-S1-54 | US-06 AC-6 | The assigned-Coordinator view, to be linked when `events-coordinator-view` is converted (group 3) |
