# Sprint 1 test cases

# NOTE: "US-02, US-10, US-11, US-12 (Week 7 Changes 5/6) and US-13–15 (Changes 1/2) are deferred until those changes merge into Sprint3-MAIN. Existing team tests for these stories are kept and still pass; they'll be updated/converted and their test cases written after the merge."

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
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test, and again before each of the 20 iterations). Logged in as coord.a@example.com. Request `e-submitted` is SUBMITTED and assigned to Cody. |
| Test Steps | 1. Reset the testDB and load the pre-condition scripts.<br>2. Send "Approve" and "Reject" (reason "Clashes with the examination period") for `e-submitted` at the same moment (`Promise.all`).<br>3. Read the stored status.<br>4. Repeat steps 1–3 for 20 iterations. |
| Test Data | Request `e-submitted`; reject reason "Clashes with the examination period"; 20 iterations |
| Expected Result | Exactly one decision succeeds and the other is refused with 409 Conflict. The final status, and the stored reason, match the decision that succeeded. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | After the fix: in 3 runs of 20 iterations (60 in total), exactly one call returned HTTP 200 and the other 409 every time. The stored status matched the winner, and `decisionReason` was set only when Reject won. (Before the fix: both calls returned 200 in 60 of 60 iterations.) |
| Status | Pass |
| Remarks | Bug found by test audit; fixed (gap #2) in `61401ec`. Each decision now row-locks the request at the start of its transaction, and only while it still holds the status that was read, so the loser gets 409 and its writes roll back. Approval requires an assigned Coordinator, consistent with Week 7 Change 5. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-review.e2e-spec.ts::lets exactly one of a simultaneous approve and reject succeed, and stores that outcome` |

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
| Actual Result | Both refused: HTTP 400 for reject and for return. The stored request stayed SUBMITTED, with `decisionReason` and `clarificationRequest` still null. 26/26 passed in each of 3 runs. |
| Status | Pass |
| Remarks | Bug found by test audit; fixed (gap #1). Fixed in 93316fa. This test is now the regression test. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-decision.e2e-spec.ts::%s is blocked when the reason is whitespace-only` (reject, return) |

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
- **AC-2 (fixed):** a whitespace-only reason used to be accepted (audit gap #1). Fixed in 93316fa, and TC-S1-11 is now its regression test.
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
| Actual Result | HTTP 400 with "a question is required to request clarification". No clarification message was stored. The request stayed SUBMITTED with no outstanding question. 26/26 passed in each of 3 runs. |
| Status | Pass |
| Remarks | Bug found by test audit; fixed (gap #1) in 93316fa. This test is its regression test. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-clarification.e2e-spec.ts::rejects a whitespace-only question` |

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

### TC-S1-63

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-63 |
| Story/AC ref | US-09 AC-4 (conflict) |
| Test Scenario | The Organiser's response to one clarification question is sent twice at the same moment |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test, and again before each of the 20 iterations). `e-submitted` is owned by organiser@example.com and assigned to coord.a@example.com. Cody asks one question through the API, so the request is AWAITING_CLARIFICATION. Logged in as organiser@example.com. |
| Test Steps | 1. Reset the testDB and load the pre-condition scripts.<br>2. Cody asks "Which room layout do you need?".<br>3. Olivia sends two responses for `e-submitted` at the same moment (`Promise.all`).<br>4. Read the stored status, the number of stored answers and the number of notifications to Cody.<br>5. Repeat steps 1–4 for 20 iterations. |
| Test Data | Question "Which room layout do you need?"; responses "Theatre style" and "Boardroom style"; 20 iterations |
| Expected Result | Exactly one response is accepted and the other is refused with 409 Conflict. The request is UNDER_REVIEW, the thread holds one answer, and the Coordinator is notified once. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | After the fix: in 3 runs of 20 iterations (60 in total), one response returned 201 and the other 409 every time. The status was UNDER_REVIEW, with 1 answer stored and 1 notification record for Cody. (Before the fix: both returned 201 in 57 of 60 iterations, with 2 answers and 2 notifications. Only the first iteration of each run was clean.) |
| Status | Pass |
| Remarks | Bug found by test audit; fixed (gap #3). `respondToClarification()` now starts its transaction with the same row lock as the review decisions (`claimForDecision`), so the loser gets 409 and its answer and notification are never saved. The notification is checked as a stored record only (see TC-S1-20). Listed after TC-S1-22 to keep it with US-09. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/events-clarification.e2e-spec.ts::accepts exactly one of two simultaneous responses to the same question` |

**US-09 AC ↔ code mismatches**
- **AC-1 (fixed):** a whitespace-only question used to be accepted (audit gap #1). Fixed in 93316fa, and TC-S1-18 is now its regression test.
- **AC-4:** "the Coordinator is notified" is only met by storing a notification record today. Nothing is delivered (no email, push or in-app feed). TC-S1-20 stays Not Executed until the Sprint 3 story "Be Notified of My Request Outcome" lands.
- **AC-4 (fixed):** two simultaneous responses to one question were both accepted, storing two answers and notifying twice (audit gap #3). Fixed, and TC-S1-63 is now its regression test.

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
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). This applies to the integration step; the unit tests need no database and freeze the clock at 2030-06-01T12:00:00.000Z. |
| Test Steps | 1. With the clock frozen, validate one submission per boundary: start 1 ms in the past, at the current instant and 1 ms in the future; end 1 ms before, equal to and 1 ms after the start; attendance −1, 0 and 1; each required text field as "   "; a padded name.<br>2. Over the API, Olivia submits one request with a start 1 minute in the past, an end equal to it, attendance 0 and a name of spaces. |
| Test Data | start = now − 1 ms / now / now + 1 ms; end = start − 1 ms / start / start + 1 ms; attendance −1 / 0 / 1; name, purpose, description, category = "   "; name "  Gala  " |
| Expected Result | Blocked, each flagged on its own field: a start in the past, an end not after the start, attendance 0 or below, and whitespace-only required text. Accepted: a start at or after the current instant, an end after the start, and attendance 1. Padded text is accepted and stored trimmed. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Unit (15/15): the past start flagged proposedStart; the end equal to or before the start flagged proposedEnd; 0 and −1 flagged expectedAttendance; each "   " field flagged that field ("… is required"). A start at or after the instant, an end 1 ms after the start and attendance 1 were accepted, and "  Gala  " was stored as "Gala". Integration: HTTP 400 naming all four fields, with no request stored. 22/22 passed in each of 3 runs. |
| Status | Pass |
| Remarks | Closes audit G4 (US-03 boundaries). Whitespace-only text is the regression check for gap #1, fixed in 93316fa. "Now" is accepted because the AC blocks a past date, and the current instant is not past. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `src/events/create-event-request.dto.spec.ts::CreateEventRequestDto boundaries (TC-S1-27, US-03 AC-3)` (15 unit tests)<br>`test/events-submit.e2e-spec.ts::blocks boundary values and flags each field: start just past, end = start, attendance 0, blank name` |

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
- **AC-3 (fixed and tested):** whitespace-only required text used to be accepted (audit gap #1), fixed in 93316fa. The boundaries (end = start, start just past, attendance 0/1, whitespace) are now tested by TC-S1-27.

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
| Remarks | The AC's own example (submitted → under review) has no Coordinator action that sets UNDER_REVIEW on first review (see mismatches). That transition is covered by the non-showcase test "reflects a later submitted -> under review change", which writes the status directly. Pending team decision on what triggers Under Review (raised with devs). |
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

## US-01 Log in securely (all roles)

### TC-S1-55

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-55 |
| Story/AC ref | US-01 AC-1 |
| Test Scenario | A registered user with valid credentials is authenticated and gets a session |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Not logged in. Account organiser@example.com (Olivia Organiser) exists with no failed attempts. |
| Test Steps | 1. Olivia logs in with her email and correct password.<br>2. She inspects the token she receives.<br>3. She opens a protected route (`GET /auth/me`) with that token. |
| Test Data | organiser@example.com / correct-horse-battery-staple |
| Expected Result | Olivia is authenticated. She receives an access token that identifies her and her role, and the token opens protected routes. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 200 with a three-part JWT. Its `sub` was `u-organiser` and its `role` was `EVENT_ORGANISER`. `GET /auth/me` with the token returned 200. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/auth.e2e-spec.ts::returns 200 with an access token`<br>`test/auth.e2e-spec.ts::issues a token carrying userId and role`<br>`test/auth.e2e-spec.ts::establishes a session that opens protected routes` |

### TC-S1-56

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-56 |
| Story/AC ref | US-01 AC-2 |
| Test Scenario | A wrong password and an unknown email get the same generic error, and no token |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Not logged in. Account organiser@example.com exists; nobody@example.com does not. |
| Test Steps | 1. Log in as organiser@example.com with a wrong password.<br>2. Log in as nobody@example.com with a password.<br>3. Compare the two responses.<br>4. Log in with a number as the email. |
| Test Data | organiser@example.com / wrong-password; nobody@example.com / correct-horse-battery-staple; email `12345` (a number) |
| Expected Result | Both attempts are refused with the same generic message, "invalid email or password", and no token. The two responses are identical, so neither reveals which field was wrong. A malformed email (not a string) is refused as invalid input with a validation message, not a server error, and no token. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Both returned HTTP 401 with message "invalid email or password" and no `accessToken`. The two bodies and status codes were identical. Neither body contained wording such as "wrong password" or "not found". The numeric email returned HTTP 400 with "email must be a valid email address" and no token. |
| Status | Pass |
| Remarks | The unknown email is still checked against a dummy bcrypt hash, so the two failures also take a similar time. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/auth.e2e-spec.ts::rejects a wrong password with 401 and no token`<br>`test/auth.e2e-spec.ts::rejects an unknown email with 401 and no token`<br>`test/auth.e2e-spec.ts::returns byte-identical bodies for both, revealing neither field`<br>`test/auth.e2e-spec.ts::rejects a non-string email with 400 and a validation message` |

### TC-S1-57

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-57 |
| Story/AC ref | US-01 AC-3 (API) |
| Test Scenario | A request without a valid token is refused at the API, and no data is returned |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Not logged in. |
| Test Steps | 1. Call `GET /auth/me` with no token.<br>2. Call it with a malformed token.<br>3. Call it with a token signed with the wrong secret.<br>4. Call `POST /auth/logout` with no token. |
| Test Data | No header; `Bearer not-a-real-token`; a forged HS256 token for `user-1` / ATTENDEE |
| Expected Result | Every request is refused as unauthenticated (401), and no protected data is returned. The refusal tells the client where to log in: a `WWW-Authenticate` header and the login URL in the body. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | All four requests returned HTTP 401. The no-token response contained no `userId` or `role`, and had `WWW-Authenticate: Bearer realm="connectsphere"` and `loginUrl: "/auth/login"`. |
| Status | Pass |
| Remarks | The browser redirect is the UI half of this AC (TC-S1-58). Since `configureApp()` (895d205), the test app registers `UnauthorizedFilter` as production does, so the 401 shape tested here is the production one. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/auth.e2e-spec.ts::rejects a request with no token`<br>`test/auth.e2e-spec.ts::points an unauthenticated caller at the login page`<br>`test/auth.e2e-spec.ts::rejects a malformed token`<br>`test/auth.e2e-spec.ts::rejects a token signed with the wrong secret`<br>`test/auth.e2e-spec.ts::rejects logout without a token` |

### TC-S1-58

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-58 |
| Story/AC ref | US-01 AC-3 (UI) |
| Test Scenario | An unauthenticated user who opens a protected page is redirected to the login page |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Not logged in; no token in the browser. |
| Test Steps | 1. Open a protected page (for example, the Organiser's event list) in the browser. |
| Test Data | — |
| Expected Result | The user is redirected to the login page, and no protected content is shown. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | — |
| Status | Not Executed |
| Remarks | A browser redirect, to be covered by the planned Playwright E2E session. The API half is TC-S1-57. |
| Executed By | — |
| Date of Execution | — |
| Automated by | Playwright (pending) |

### TC-S1-59

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-59 |
| Story/AC ref | US-01 AC-4 |
| Test Scenario | Logging out ends the session, and the old token can't be reused |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Olivia (organiser@example.com) logs in during the test. |
| Test Steps | 1. Olivia logs in and opens `GET /auth/me`.<br>2. She logs out.<br>3. She reuses the same token on `GET /auth/me`.<br>4. She logs in again and opens `GET /auth/me`.<br>5. With two sessions open, she logs out of one and uses the other. |
| Test Data | organiser@example.com / correct-horse-battery-staple |
| Expected Result | Logout ends the session. Reusing the old token is refused (401), and access needs a new login. Logging out one session leaves her other sessions alone. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | `/auth/me` returned 200, logout returned 204, and the same token then got 401. A new login issued a different token that returned 200. After logging out session A, session B still returned 200. |
| Status | Pass |
| Remarks | Logout revokes the token by its `jti`. Only that token is revoked. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/auth.e2e-spec.ts::returns 204 and makes the token unusable afterwards`<br>`test/auth.e2e-spec.ts::requires logging in again to regain access`<br>`test/auth.e2e-spec.ts::does not revoke other sessions belonging to the same user` |

### TC-S1-60

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-60 |
| Story/AC ref | US-01 AC-5 (14/15 boundary) |
| Test Scenario | 14 failures leave the account open; the 15th locks it, and further attempts, even with the correct password, get the helpline message |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before every test, so no failed-attempt count carries over). Not logged in. Account organiser@example.com has 0 failed attempts and no lock. |
| Test Steps | 1. Fail 14 times in a row, then check the account and log in correctly.<br>2. (Fresh reset) Fail 15 times in a row, then try once more with a wrong password.<br>3. (Fresh reset) Fail 15 times in a row, then try with the correct password. |
| Test Data | organiser@example.com / wrong-password ×14 or ×15; then correct-horse-battery-staple |
| Expected Result | After 14 failures the account is not locked, and the correct password logs in. After 15 consecutive failures within 30 minutes the account is temporarily locked. Every further attempt, including one with the correct password, is refused with a message directing the user to the IT helpline, and no token is issued. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | After 14 failures: count 14, `lockedUntil` null, and the correct login returned 200. The 15th failure returned 401 "invalid email or password" and set the lock. The 16th attempt returned 429 with "Account temporarily locked due to repeated failed sign-in attempts. Please contact the IT helpline for assistance." and no token. The correct password while locked also returned 429 with no token. |
| Status | Pass |
| Remarks | The 15th failure itself still returns the generic 401. The helpline message appears from the next attempt, which matches "further attempts". |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/auth.e2e-spec.ts::stays open for the first 14 failures`<br>`test/auth.e2e-spec.ts::locks on the 15th and points the user at the helpline`<br>`test/auth.e2e-spec.ts::refuses the correct password while locked` |

### TC-S1-61

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-61 |
| Story/AC ref | US-01 AC-5 (30-minute window edge) |
| Test Scenario | 15 failures count toward a lock only when they fall within 30 minutes; failures spread beyond 30 minutes don't lock |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Not logged in. Account organiser@example.com has 0 failed attempts. The clock is frozen at T0 (Date only), with no real waiting. |
| Test Steps | 1. (Integration) Fail 14 times at T0.<br>2. Move the clock to T0 + 30 min + 1 ms and fail a 15th time.<br>3. Check the account, then log in with the correct password.<br>4. (Unit) With 14 failures since T0, fail a 15th time at exactly T0 + 30 min.<br>5. (Unit) With 14 failures since T0, fail a 15th time at T0 + 30 min + 1 ms.<br>6. (Unit) While a lock is in force, log in with the correct password. |
| Test Data | organiser@example.com / wrong-password; correct-horse-battery-staple. T0 = test start (integration) or 2030-06-01T12:00Z (unit). |
| Expected Result | A 15th failure at exactly 30 minutes is still within the window and locks the account. A 15th failure after 30 minutes does not lock it, and counting starts again from that failure, so the correct password still logs in. While a lock is in force, the correct password is refused with the helpline message. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Integration: the 15th failure at T0 + 30 min + 1 ms returned 401 "invalid email or password". The stored count was 1, `lockedUntil` was null, and the correct login returned 200. Unit: at exactly 30 min the count reached 15, with `lockedUntil` = T0 + 60 min. At 30 min + 1 ms the count reset to 1 with a new window start and no lock. Under a lock, the correct password got 429 with the helpline message. |
| Status | Pass |
| Remarks | New tests, added this session (lockout window edge). See the mismatch note below on fixed versus sliding windows. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/auth.e2e-spec.ts::does not lock when the 15 failures are spread beyond 30 minutes`<br>`src/auth/auth.service.lockout-window.spec.ts::locks when the 15th failure lands exactly 30 minutes after the first (still within the window)`<br>`src/auth/auth.service.lockout-window.spec.ts::does not lock when the 15th failure lands 1 ms after the window closes; the count restarts at 1`<br>`src/auth/auth.service.lockout-window.spec.ts::refuses the correct password with the helpline message while a lock is in force` |

### TC-S1-62

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-62 |
| Story/AC ref | US-01 AC-5 ("consecutive", "temporarily") |
| Test Scenario | A successful login resets the failure count, and the lock is temporary |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Not logged in. Account organiser@example.com has 0 failed attempts and no lock. |
| Test Steps | 1. Fail 5 times, then log in correctly, then check the account.<br>2. (Fresh reset) Fail 15 times so the account locks, and confirm the correct password gets 429.<br>3. Let the lock period pass (the test sets `lockedUntil` to the past), then log in correctly. |
| Test Data | organiser@example.com / wrong-password ×5 or ×15; correct-horse-battery-staple |
| Expected Result | Failures only count while consecutive: a successful login clears the count. The lock is temporary: once it has elapsed, the correct password logs in again. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | After 5 failures and a successful login, the count was 0 and the window start was null. The locked account got 429. Once `lockedUntil` was in the past, the correct login returned 200. |
| Status | Pass |
| Remarks | The AC doesn't state how long the lock lasts. The code locks for 30 minutes, and the expiry is simulated by moving `lockedUntil` into the past, not by waiting. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | `test/auth.e2e-spec.ts::resets the count after a successful login`<br>`test/auth.e2e-spec.ts::unlocks once the lock period has elapsed` |

**US-01 AC ↔ code mismatches**
- **AC-5, fixed versus sliding window (flagged for the team).** The code counts failures in a fixed 30-minute window that starts at the first failure, and the first failure after the window closes restarts the count at 1. If the AC means *any* 15 consecutive failures within 30 minutes (a sliding window), the code can miss a lock. Example: 1 failure at T0, 13 at T0 + 29 min, then 2 at T0 + 30.5 min. Failures 2 to 16 all fall within about 2 minutes, so a sliding window would lock. The code restarts the count at T0 + 30.5 min and ends at 2, with no lock. TC-S1-61 passes under either reading, because its failures span more than 30 minutes. The team should confirm with the customer which reading is intended. The code is unchanged.
- **AC-5, the 15th attempt.** The 15th failure returns the generic 401 and sets the lock. The helpline message (429) appears from the 16th attempt. This matches "further attempts", but a reader expecting the 15th response itself to name the helpline would see it one attempt later.
- **AC-5, lock duration.** The AC says "temporarily" without a duration. The code uses 30 minutes (TC-S1-62).

---

## Changes since Sprint 1

Changes to the system or to these test cases made after the Sprint 1 review, newest first.

| Date | Change | Commit | Test cases affected |
|---|---|---|---|
| 2026-10-17 | **Test apps match production; coverage gaps filled.** `configureApp()` is now shared by `main.ts` and the 8 converted integration files, so tests see the same pipes, `UnauthorizedFilter` and CORS as production; no existing result changed. Two tests were added from coverage-s1.md: the 401 carries `WWW-Authenticate` and `loginUrl`, and a numeric email gets 400. | `895d205` (setup); this commit (tests) | TC-S1-56 and TC-S1-57 (extra test each; still Pass). |
| 2026-10-17 | **Concurrent clarification responses made atomic (audit gap #3).** `respondToClarification()` starts its transaction with the same row lock as the review decisions (`claimForDecision`), so a second, simultaneous response gets 409 and stores nothing. The conflict message is now neutral: "this request has just been updated by someone else; reload it and try again". | this commit | TC-S1-63 (new; Fail as `it.failing` in `da1e278`, now Pass). |
| 2026-10-17 | **Concurrent review decisions made atomic (audit gap #2).** Approve, reject, return and request clarification each start their transaction by row-locking the request only while it still holds the status that was read (`claimForDecision`, `SELECT … FOR UPDATE`). A concurrent decision waits, then gets 409 Conflict, and its reason, question and history roll back. `setStatus()` is still the only writer of status. | `61401ec` | TC-S1-07 (Fail → Pass; the race test is now a regular regression test, no longer `it.failing`, and requires the loser to get 409). |
| 2026-10-17 | **US-01 lockout window-edge tests added.** The existing tests covered the 14/15 boundary but not the 30-minute window edge. Three unit tests (frozen clock: exactly 30 min locks; 30 min + 1 ms restarts the count; the correct password is refused while locked) and one integration test (15 failures spread beyond 30 minutes don't lock). `test/auth.e2e-spec.ts` was converted to the shared test-DB pattern, with assertions unchanged. | — | TC-S1-61 (new, Pass). TC-S1-55 to 60 and 62 now load base-users.sql. |
| 2026-10-17 | **Week 7 Change 5 handover (Event Coordinator Lead, unassigned queue).** Change 5 is being built on `Sprint3-MAIN`, so two test cases wait on it here. Five existing integration tests assert the pre-Change-5 pool, where any Coordinator sees unassigned submissions. They are handed to the Sprint 3 tester, to update when Change 5 merges:<br>`events-submit::makes the request visible to a Coordinator for review`<br>`events-draft::makes it visible to a Coordinator once submitted`<br>`events-layout::shows layout and accessibility in the review queue`<br>`events-layout::shows them when the Coordinator opens the request`<br>`events-review::approves once that request has been assigned (US-10 then US-07)` | — | TC-S1-25 (Lead's unassigned queue; Not Executed, pending Change 5 merge). TC-S1-54 (assigned Coordinator sees the preferences; linked in group 3 via tc-s1-54-setup.sql). |
| 2026-10-17 | **Gap tests added.** TC-S1-27: US-03 boundaries, as 15 unit tests with a frozen clock plus 1 integration test. TC-S1-18: whitespace-only question. TC-S1-07: simultaneous approve and reject, which reproduces audit gap #2 in 60 of 60 iterations and is captured as `it.failing`. | — | TC-S1-27 and TC-S1-18 are now Pass. TC-S1-07 is now Fail (known bug, gap #2). |
| 2026-10-17 | **Whitespace-only text rejected in required fields (audit gap #1).** The test audit found that `@IsNotEmpty` accepted `"   "`. A new `@Trim()` transform now runs on every Sprint 1 text field: event request, draft, reject/return reason, clarification question/response and venue draft. Whitespace-only required text is now refused; optional text is trimmed and may be empty. | `93316fa` | TC-S1-11 (Fail → Pass; its test is now a regular regression test, no longer `it.failing`). TC-S1-18 and TC-S1-27 are covered by the fix but still need their tests (GAP). |

---

## Gaps (no automated test yet)

| Test case | Story/AC | What's missing |
|---|---|---|
| TC-S1-15 | US-09 AC-1 (UI) | A Playwright check that the clarification text field exists (planned E2E session) |
| TC-S1-25 | US-03 AC-2 | A test that a new submission appears in the Lead's unassigned queue and not to Coordinators. Pending the Change 5 merge. |
| TC-S1-34 | US-04 AC-3 (UI) | A Playwright check that a draft is visually distinguishable (planned E2E session) |
| TC-S1-54 | US-06 AC-6 | The assigned-Coordinator view, to be linked when `events-coordinator-view` is converted (group 3) |
| TC-S1-58 | US-01 AC-3 (UI) | A Playwright check that an unauthenticated visit to a protected page redirects to login (planned E2E session) |
