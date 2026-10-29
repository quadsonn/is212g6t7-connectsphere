# Sprint 4 test cases

Written test cases for the Sprint 4 user stories (Story 58 onwards), traced from story → acceptance criterion → test case → automated test, in the same format as [sprint3-test-cases.md](sprint3-test-cases.md) (see "How to read this file" there). Test case IDs start at **TC-S4-58**.

Done: **Story 58 to 67** (TC-S4-58 to 110).

---

## Story 58 Respond to a Coordinator's Request for Clarification (Event Organiser)

### TC-S4-58

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-58 |
| Story/AC ref | Story 58 AC-1 |
| Test Scenario | The Organiser sees which requests are awaiting clarification, with the Coordinator's question on the request |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql + tc-s4-58-setup.sql on testDB (reset before test), as each step needs. "Freshman Orientation 2030" (`EVT-146`, 320 people) is Olivia's (organiser@example.com) and assigned to Cody (coord.a@example.com). Cody asks his question in the test (or tc-s4-58-setup.sql has asked it, for the browser test). Logged in as organiser@example.com. |
| Test Steps | 1. Cody asks a question.<br>2. Olivia reads her list of requests and opens the request. |
| Test Data | — |
| Expected Result | The request is shown as awaiting clarification, in the list and on the request, with the question. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | List entry and request both AWAITING_CLARIFICATION with `clarificationRequested`; the request showed the question. In the browser the list read "Awaiting clarification" and the page showed the question. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::AC1: Given a question was asked, Then the request shows as awaiting clarification with the question`<br>E2E: `e2e/us58-clarification-response.spec.ts::the Organiser answers with an updated detail and sees it under the question`<br>UI: `frontend/src/features/events/components/clarification-panel.test.tsx::Given a question is waiting, Then the latest one is tagged "Waiting for your reply"` |

### TC-S4-59

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-59 |
| Story/AC ref | Story 58 AC-2 |
| Test Scenario | The Organiser writes and submits a response from the request's page |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql + tc-s1-22-setup.sql + tc-s4-58-setup.sql on testDB (reset before test), as each step needs. "Freshman Orientation 2030" (`EVT-146`, 320 people) is Olivia's (organiser@example.com) and assigned to Cody (coord.a@example.com). Cody asks his question in the test (or tc-s4-58-setup.sql has asked it, for the browser test). Logged in as organiser@example.com. tc-s1-22-setup.sql adds a second Organiser. |
| Test Steps | 1. Olivia responds.<br>2. Another Organiser responds on her request.<br>3. Olivia responds when no question is waiting. |
| Test Data | — |
| Expected Result | Only the request's own Organiser can respond, and only while a question waits. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | 201 for Olivia; another Organiser 404 with nothing changed; responding with no question waiting 409. The page showed the form only while awaiting clarification and sent the trimmed text. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::AC3/AC4/AC5: Given changes, When the Organiser responds, Then they are saved, shown old -> new on the response, and the request returns for review`<br>Integration: `test/events-clarification.e2e-spec.ts::Given another Organiser’s event, When they respond with changes, Then 404 and nothing is saved`<br>Integration: `test/events-clarification.e2e-spec.ts::Given the request is not awaiting clarification, When the Organiser responds with changes, Then 409 and nothing is saved`<br>E2E: `e2e/us58-clarification-response.spec.ts::the Organiser answers with an updated detail and sees it under the question`<br>UI: `frontend/src/features/events/components/clarification-panel.test.tsx::Given the request is awaiting clarification, Then the form is shown`<br>UI: `frontend/src/features/events/components/clarification-panel.test.tsx::Given the request is not awaiting clarification, Then the history shows but there is no form`<br>UI: `frontend/src/features/events/components/clarification-panel.test.tsx::AC2/AC5: Given text only, When sent, Then just the trimmed response goes to the server` |

### TC-S4-60

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-60 |
| Story/AC ref | Story 58 AC-3 |
| Test Scenario | The response can update the request's details, with the same fields and validation as editing |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql + tc-s4-58-setup.sql on testDB (reset before test), as each step needs. "Freshman Orientation 2030" (`EVT-146`, 320 people) is Olivia's (organiser@example.com) and assigned to Cody (coord.a@example.com). Cody asks his question in the test (or tc-s4-58-setup.sql has asked it, for the browser test). Logged in as organiser@example.com. |
| Test Steps | 1. Olivia responds and changes attendance to 400 and adds layout notes.<br>2. She tries to clear the name. |
| Test Data | 400; "Second exit at the rear" |
| Expected Result | The changes are saved with the response; invalid changes are refused as in an edit. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Attendance 400 and layout notes saved; clearing the name 400 (not a server error), nothing saved. The form sent only the fields changed, and nothing when the details toggle was off. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::AC3/AC4/AC5: Given changes, When the Organiser responds, Then they are saved, shown old -> new on the response, and the request returns for review`<br>Integration: `test/events-clarification.e2e-spec.ts::Given a change that clears a required field, Then 400 rather than a server error, and nothing is saved`<br>E2E: `e2e/us58-clarification-response.spec.ts::the Organiser answers with an updated detail and sees it under the question`<br>UI: `frontend/src/features/events/components/clarification-panel.test.tsx::Given the Organiser edits one field, When sent, Then only that field is sent as a change`<br>UI: `frontend/src/features/events/components/clarification-panel.test.tsx::Given the details section is opened but nothing is changed, Then no changes are sent`<br>UI: `frontend/src/features/events/components/clarification-panel.test.tsx::Given a field is edited and the toggle turned off again, When sent, Then no changes are sent` |

### TC-S4-61

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-61 |
| Story/AC ref | Story 58 AC-4 |
| Test Scenario | The response and any changed details (old → new) are shown in the clarification history, under the question |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql + tc-s4-58-setup.sql on testDB (reset before test), as each step needs. "Freshman Orientation 2030" (`EVT-146`, 320 people) is Olivia's (organiser@example.com) and assigned to Cody (coord.a@example.com). Cody asks his question in the test (or tc-s4-58-setup.sql has asked it, for the browser test). Logged in as organiser@example.com. |
| Test Steps | 1. Olivia responds with changes.<br>2. Olivia and Cody read the thread.<br>3. A second round of question and answer. |
| Test Data | — |
| Expected Result | Each response sits under its question with its own changes, old → new, for both parties. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Thread: question (no change), answer with expectedAttendance 320 → 400 and layoutNotes none → "Second exit at the rear"; Cody saw the same; a second round kept each response's own changes. The page listed each field old → new. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::AC3/AC4/AC5: Given changes, When the Organiser responds, Then they are saved, shown old -> new on the response, and the request returns for review`<br>Integration: `test/events-clarification.e2e-spec.ts::AC4: the Coordinator sees the response and its changes in the thread too`<br>Integration: `test/events-clarification.e2e-spec.ts::Given a second round, Then each response keeps its own changes`<br>E2E: `e2e/us58-clarification-response.spec.ts::the Organiser answers with an updated detail and sees it under the question`<br>UI: `frontend/src/features/events/components/clarification-panel.test.tsx::Given a response that updated details, Then it lists each field old -> new`<br>UI: `frontend/src/features/events/components/clarification-panel.test.tsx::Given a thread, Then every message shows with its author, oldest first` |

### TC-S4-62

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-62 |
| Story/AC ref | Story 58 AC-5 |
| Test Scenario | Submitting the response returns the request to the assigned Coordinator for review |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql + tc-s4-58-setup.sql on testDB (reset before test), as each step needs. "Freshman Orientation 2030" (`EVT-146`, 320 people) is Olivia's (organiser@example.com) and assigned to Cody (coord.a@example.com). Cody asks his question in the test (or tc-s4-58-setup.sql has asked it, for the browser test). Logged in as organiser@example.com. |
| Test Steps | 1. Olivia responds.<br>2. Two responses at once.<br>3. Read Cody's notification. |
| Test Data | — |
| Expected Result | The request is back under review, the Coordinator is told what changed, and only one response is accepted. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | UNDER_REVIEW; two simultaneous responses: one 201, one 409; Cody's notice "The organiser has responded on "Freshman Orientation 2030" and updated: expected attendance." |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::AC3/AC4/AC5: Given changes, When the Organiser responds, Then they are saved, shown old -> new on the response, and the request returns for review`<br>Integration: `test/events-clarification.e2e-spec.ts::Given two responses at once, Then exactly one is accepted`<br>Integration: `test/events-clarification.e2e-spec.ts::Given changes, Then the Coordinator’s notification names the updated details`<br>E2E: `e2e/us58-clarification-response.spec.ts::the Organiser answers with an updated detail and sees it under the question`<br>Unit: `src/events/events-clarification.service.spec.ts::US-58: words the Coordinator’s notice for a request with no name` |

### TC-S4-63

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-63 |
| Story/AC ref | Story 58 AC-6 |
| Test Scenario | An empty or whitespace-only response is rejected |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test), as each step needs. "Freshman Orientation 2030" (`EVT-146`, 320 people) is Olivia's (organiser@example.com) and assigned to Cody (coord.a@example.com). Cody asks his question in the test (or tc-s4-58-setup.sql has asked it, for the browser test). Logged in as organiser@example.com. |
| Test Steps | 1. Olivia sends "   " with changes. |
| Test Data | "   " |
| Expected Result | Refused; nothing changes. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | 400; attendance still 320 and still awaiting clarification. The page disabled Send and said why. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::AC6: Given a whitespace-only response, Then 400 and nothing changes`<br>UI: `frontend/src/features/events/components/clarification-panel.test.tsx::AC6: Given a blank or whitespace-only response, Then it cannot be submitted`<br>UI: `frontend/src/features/events/components/clarification-panel.test.tsx::AC6: Given the Organiser types then clears the response, Then an inline message says why Send is disabled` |

### TC-S4-64

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-64 |
| Story/AC ref | Story 58 AC-7 |
| Test Scenario | Nothing is saved if any updated detail fails validation |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test), as each step needs. "Freshman Orientation 2030" (`EVT-146`, 320 people) is Olivia's (organiser@example.com) and assigned to Cody (coord.a@example.com). Cody asks his question in the test (or tc-s4-58-setup.sql has asked it, for the browser test). Logged in as organiser@example.com. |
| Test Steps | 1. Olivia responds with an end time before the start. |
| Test Data | Start 17:00, end 09:00 |
| Expected Result | Refused; nothing saved; status and thread unchanged. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | 400; start unchanged, still AWAITING_CLARIFICATION, thread still one message. The page showed the problem and kept the form. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::Given a field update that fails validation, Then 400, nothing is saved, and the status does not change`<br>Integration: `test/events-clarification.e2e-spec.ts::Given a change that clears a required field, Then 400 rather than a server error, and nothing is saved`<br>UI: `frontend/src/features/events/components/clarification-panel.test.tsx::Given the server refuses a change, Then the problem is shown and the form stays` |

**Story 58 AC ↔ code notes**
- AC-1: the list shows the status and that a question waits; the question itself is on the request page.

## Story 59 Notify Attendees When Registration Opens, Closes or Reaches Capacity (Attendee)

### TC-S4-65

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-65 |
| Story/AC ref | Story 59 AC-1 |
| Test Scenario | When registration opens for an event, every Attendee not registered is notified, with a link to the event |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s4-65-setup.sql + tc-s4-65b-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-302`, CONFIRMED, registration enabled, open from 1 Jan 2026, closing 28 Nov 2030) has Main Hall (10) and Annex (8) approved: 18 seats. a1–a3 are Registered, a4 Withdrew; Ann and a5–a8 are not registered (9 Attendees in all). The sweep is called directly with the moment to judge by. tc-s4-65b-setup.sql adds "Spring Gala" (`EVT-303`), opening 1 Oct 2030. |
| Test Steps | 1. Run the "opened" sweep twice.<br>2. Ann reads her inbox.<br>3. Run it with an event that opens later. |
| Test Data | Judged at 1 Nov 2030 (Careers Fair); 1 Sep and 2 Oct 2030 (Spring Gala) |
| Expected Result | Every Attendee not registered is told once, with a link; nobody is told before registration opens. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Ann and a4–a8 told once each, linking to `/events/EVT-302`. Spring Gala's Attendees were told nothing on 1 Sep and all 9 on 2 Oct, once it had opened. |
| Status | Pass |
| Remarks | **Gap found by testing (gap #5), fixed 2026-10-29.** `notifyOpened` used to send once the event was CONFIRMED with registration enabled, without checking the opening time. It now skips events whose `resolveWindow().opensAt` is still to come, as `notifyClosed` does for the closing time. First run: Fail. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us59-registration-notices.e2e-spec.ts::tells every Attendee not registered, once, with a link to the event`<br>Integration: `test/us59-registration-notices.e2e-spec.ts::says nothing for an event whose registration has not opened yet, then tells them once it opens`<br>Unit: `src/registrations/registration-notifications.service.spec.ts::words every notice for an event with no name, and says "1 place" or "full"`<br>Unit: `src/registrations/registration-notifications.scheduler.spec.ts::runs the opened, closed and near-capacity sweeps, even when one fails` |

### TC-S4-66

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-66 |
| Story/AC ref | Story 59 AC-2 |
| Test Scenario | A registered Attendee does not get the "opens" notice; one not registered gets only that notice |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s4-65-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-302`, CONFIRMED, registration enabled, open from 1 Jan 2026, closing 28 Nov 2030) has Main Hall (10) and Annex (8) approved: 18 seats. a1–a3 are Registered, a4 Withdrew; Ann and a5–a8 are not registered (9 Attendees in all). The sweep is called directly with the moment to judge by. |
| Test Steps | 1. Run the "opened" sweep.<br>2. Run the "closed" sweep after closing. |
| Test Data | — |
| Expected Result | Registered Attendees get no "opens" notice; the others get no "closes" notice. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | a1–a3 had no REGISTRATION_OPENED; only a1–a3 had REGISTRATION_CLOSED (TC-S4-67). |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us59-registration-notices.e2e-spec.ts::tells every Attendee not registered, once, with a link to the event` |

### TC-S4-67

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-67 |
| Story/AC ref | Story 59 AC-3 |
| Test Scenario | When registration closes, the Registered Attendees are notified, with a link to the event |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s4-65-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-302`, CONFIRMED, registration enabled, open from 1 Jan 2026, closing 28 Nov 2030) has Main Hall (10) and Annex (8) approved: 18 seats. a1–a3 are Registered, a4 Withdrew; Ann and a5–a8 are not registered (9 Attendees in all). The sweep is called directly with the moment to judge by. |
| Test Steps | 1. Run the "closed" sweep before and after the closing time, twice after. |
| Test Data | Judged at 1 Nov and 29 Nov 2030 |
| Expected Result | Only the Registered Attendees are told, once, after closing. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Nothing before closing; a1–a3 once each after. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us59-registration-notices.e2e-spec.ts::tells only the Registered Attendees, once, after the closing time`<br>Unit: `src/registrations/registration-notifications.service.spec.ts::words every notice for an event with no name, and says "1 place" or "full"`<br>Unit: `src/registrations/registration-notifications.service.spec.ts::sends nothing when the stamp is found set once the row is locked`<br>Unit: `src/registrations/registration-notifications.scheduler.spec.ts::runs the opened, closed and near-capacity sweeps, even when one fails` |

### TC-S4-68

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-68 |
| Story/AC ref | Story 59 AC-4 |
| Test Scenario | An event's capacity is how many people its venues can hold |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s4-65-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-302`, CONFIRMED, registration enabled, open from 1 Jan 2026, closing 28 Nov 2030) has Main Hall (10) and Annex (8) approved: 18 seats. a1–a3 are Registered, a4 Withdrew; Ann and a5–a8 are not registered (9 Attendees in all). The sweep is called directly with the moment to judge by. |
| Test Steps | 1. Run the near-capacity sweep with 3 registered. |
| Test Data | 10 + 8 seats |
| Expected Result | Capacity is the total of the approved venues (18), so 15 seats are left and nothing is sent. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Nothing sent at 15 left (Main Hall alone would have left 7). |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us59-registration-notices.e2e-spec.ts::counts every approved venue, and tells the Registered Attendees once 10 or fewer seats are left` |

### TC-S4-69

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-69 |
| Story/AC ref | Story 59 AC-5 |
| Test Scenario | At 10 or fewer seats left, the Registered Attendees are notified, with a link to the event |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s4-65-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-302`, CONFIRMED, registration enabled, open from 1 Jan 2026, closing 28 Nov 2030) has Main Hall (10) and Annex (8) approved: 18 seats. a1–a3 are Registered, a4 Withdrew; Ann and a5–a8 are not registered (9 Attendees in all). The sweep is called directly with the moment to judge by. |
| Test Steps | 1. Ann and a5–a8 register through the API.<br>2. Run the near-capacity sweep. |
| Test Data | 8 registered of 18 |
| Expected Result | All 8 Registered Attendees are told. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | All 8 told: "Only 10 places left for "Careers Fair"." linked to `EVT-302`. Unit: "1 place" and "is now full" worded right. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us59-registration-notices.e2e-spec.ts::counts every approved venue, and tells the Registered Attendees once 10 or fewer seats are left`<br>Unit: `src/registrations/registration-notifications.service.spec.ts::words every notice for an event with no name, and says "1 place" or "full"`<br>Unit: `src/registrations/registration-notifications.scheduler.spec.ts::runs the opened, closed and near-capacity sweeps, even when one fails` |

### TC-S4-70

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-70 |
| Story/AC ref | Story 59 AC-6 |
| Test Scenario | The notice is also sent if venue capacity is reduced to 10 or fewer seats left |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s4-65-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-302`, CONFIRMED, registration enabled, open from 1 Jan 2026, closing 28 Nov 2030) has Main Hall (10) and Annex (8) approved: 18 seats. a1–a3 are Registered, a4 Withdrew; Ann and a5–a8 are not registered (9 Attendees in all). The sweep is called directly with the moment to judge by. |
| Test Steps | 1. Vera reduces Main Hall to 4 through the venue edit.<br>2. Run the sweep. |
| Test Data | Main Hall 10 → 4 |
| Expected Result | The Registered Attendees are told. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | 12 seats, 9 left: a1–a3 told. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us59-registration-notices.e2e-spec.ts::also notifies when a venue's capacity is reduced` |

### TC-S4-71

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-71 |
| Story/AC ref | Story 59 AC-7 |
| Test Scenario | The near-capacity notice is sent only the first time |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s4-65-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-302`, CONFIRMED, registration enabled, open from 1 Jan 2026, closing 28 Nov 2030) has Main Hall (10) and Annex (8) approved: 18 seats. a1–a3 are Registered, a4 Withdrew; Ann and a5–a8 are not registered (9 Attendees in all). The sweep is called directly with the moment to judge by. |
| Test Steps | 1. Reduce capacity; sweep.<br>2. a1 withdraws; sweep.<br>3. a1 registers again; sweep. |
| Test Data | — |
| Expected Result | Sent once, never again. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | a1–a3 told once; no second notice after seats freed and filled again. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us59-registration-notices.e2e-spec.ts::is sent only the first time, even if seats free up and fill again`<br>Unit: `src/registrations/registration-notifications.service.spec.ts::sends nothing when the stamp is found set once the row is locked` |

### TC-S4-72

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-72 |
| Story/AC ref | Story 59 AC-8 |
| Test Scenario | If venue capacity is not known, no near-capacity notice is sent |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-99-setup.sql + tc-s4-65-setup.sql + tc-s4-72-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-302`, CONFIRMED, registration enabled, open from 1 Jan 2026, closing 28 Nov 2030) has Main Hall (10) and Annex (8) approved: 18 seats. a1–a3 are Registered, a4 Withdrew; Ann and a5–a8 are not registered (9 Attendees in all). The sweep is called directly with the moment to judge by. tc-s4-72-setup.sql takes both venues back to draft with no capacity. |
| Test Steps | 1. 8 register.<br>2. Run the sweep. |
| Test Data | Capacity unknown |
| Expected Result | Nothing is sent. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Nothing sent. |
| Status | Pass |
| Remarks | A published venue must have a capacity (CHECK `Venue_complete_unless_draft`), so only a venue taken back to draft can lack one. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us59-registration-notices.e2e-spec.ts::sends nothing when no venue capacity is known` |

**Story 59 AC ↔ code notes**
- AC-1: the "opens" notice used to go out on confirmation, before the opening time (gap #5, TC-S4-65); fixed 2026-10-29.
- The notices come from a once-a-minute sweep, so they arrive within a minute of the moment.

## Story 60 Tech Support Alerted When Equipment Is Marked Damaged or Unavailable (Technical Support)

### TC-S4-73

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-73 |
| Story/AC ref | Story 60 AC-1 |
| Test Scenario | Marking an item damaged or under maintenance notifies every other Technical Support member, with the item name and new status |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s4-73-setup.sql + tc-s4-73b-setup.sql on testDB (reset before test), as each step needs. Wei, Nadia and Omar (wei@ / nadia@ / omar@example.com) and Toby Tech are Technical Support; the Projector (`EQP-023`) is operational. Logged in as wei@example.com. tc-s4-73b-setup.sql marks it Damaged already. |
| Test Steps | 1. Wei marks the projector Damaged, then Under Maintenance.<br>2. Nadia reads her inbox.<br>3. Return it to Available; repeat a refused change. |
| Test Data | "Cracked lens" |
| Expected Result | Every other member is told the item and status, linked to the item; returning to Available or a refused change tells no one. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Nadia and Omar: "Projector marked Damaged by Wei Technical. Reason: Cracked lens", linked to `/equipment/inventory/EQP-023`; Under Maintenance worded likewise; Available and a refused change sent nothing. The inbox showed the item, status and reason. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us60-equipment-status-alerts.e2e-spec.ts::US-60 AC-1: marking an item Damaged notifies every other member with the item name and new status`<br>Integration: `test/us60-equipment-status-alerts.e2e-spec.ts::US-60 AC-1: marking an item Under Maintenance notifies them too`<br>Integration: `test/us60-equipment-status-alerts.e2e-spec.ts::US-60 AC-1: the notice links each recipient to the item in their inbox`<br>Integration: `test/us60-equipment-status-alerts.e2e-spec.ts::US-60 AC-1: whoever makes the change is the one left out`<br>Integration: `test/us60-equipment-status-alerts.e2e-spec.ts::US-60: an item returning to Available tells no one`<br>Integration: `test/us60-equipment-status-alerts.e2e-spec.ts::US-60: a refused change (already that status) tells no one`<br>Unit: `src/equipment/equipment-status-notifier.spec.ts::US-60: says nothing for an item that has gone, and names an unknown actor "a colleague"`<br>UI: `frontend/src/features/notifications/components/equipment-status-notice.test.tsx::US-60 AC-1: shows the item name, its new status and the reason, linking to the item` |

### TC-S4-74

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-74 |
| Story/AC ref | Story 60 AC-2 |
| Test Scenario | The acting member is not notified |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s4-73-setup.sql on testDB (reset before test), as each step needs. Wei, Nadia and Omar (wei@ / nadia@ / omar@example.com) and Toby Tech are Technical Support; the Projector (`EQP-023`) is operational. Logged in as wei@example.com. |
| Test Steps | 1. Wei, then Nadia, marks it Damaged. |
| Test Data | — |
| Expected Result | Whoever made the change gets nothing. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Wei got nothing for his change; Nadia nothing for hers. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us60-equipment-status-alerts.e2e-spec.ts::US-60 AC-1: whoever makes the change is the one left out`<br>Integration: `test/us60-equipment-status-alerts.e2e-spec.ts::US-60 AC-2: the actor isn’t notified` |

### TC-S4-75

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-75 |
| Story/AC ref | Story 60 AC-3 |
| Test Scenario | The alert is inventory-wide, regardless of event assignment |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s4-73-setup.sql on testDB (reset before test), as each step needs. Wei, Nadia and Omar (wei@ / nadia@ / omar@example.com) and Toby Tech are Technical Support; the Projector (`EQP-023`) is operational. Logged in as wei@example.com. |
| Test Steps | 1. Mark it Damaged with no events at all. |
| Test Data | — |
| Expected Result | Technical Support are told; nobody else. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Nadia and Omar told with no events; Cody (a Coordinator) got nothing. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us60-equipment-status-alerts.e2e-spec.ts::US-60 AC-3: works with no events or assignments at all`<br>Integration: `test/us60-equipment-status-alerts.e2e-spec.ts::US-60 AC-3: only Technical Support hear about it — Coordinators are US-67’s` |

**Story 60 AC ↔ code notes**
- No mismatches.

## Story 61 Assign Technical Support Staff to an Event (Event Coordinator)

### TC-S4-76

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-76 |
| Story/AC ref | Story 61 AC-1 |
| Test Scenario | For an event requiring technical support, the Coordinator assigns an available member and it is recorded |
| Pre-conditions | Run test/fixtures/sql/tc-s4-76-setup.sql + tc-s4-76b-setup.sql + tc-s4-76c-setup.sql + tc-s4-76d-setup.sql + tc-s4-77c-setup.sql on testDB (reset before test), as each step needs. Users from tc-s4-76-setup.sql only: Carla (carla@example.com) is the event's Coordinator, Colin another Coordinator, Lena the Lead, and Wei and Nadia the only two Technical Support members. The "Town Hall" (`EVT-304`, 1 Oct 2030 10:00–12:00 UTC) needs on-site support. Logged in as carla@example.com. Variants: tc-s4-76c (Wei assigned), 76d (no support needed), 77c (a cancelled event). |
| Test Steps | 1. Carla reads the screen and assigns Wei.<br>2. Changes to Nadia; removes.<br>3. Tries invalid cases and other users. |
| Test Data | — |
| Expected Result | Wei is recorded with a history entry; changes and removal are recorded; invalid cases and other users are refused. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Assigned (200) with "technicalSupport: none → Wei Technical" in history; change and removal worked; no support needed 409; non-Technical-Support 400; same member 400; unknown 404; cancelled event 409; removing with nobody 409; Olga, Wei and Lena 403; Colin refused; no token 401. The card assigned and removed. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-1: assign succeeds and records the member against the event`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-1: the assignment goes into the event history with who made it`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-1: the screen lists every member as available when nobody is busy`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-1: the Coordinator can change the assignment, and the change is recorded`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-1: the Coordinator can remove the assignment`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-1: an event not marked as requiring technical support cannot be assigned`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-1: a user without the Technical Support role cannot be assigned`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::refuses the member already assigned (400) and an unknown member (404)`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::refuses changes on a cancelled event, and removing when nobody is assigned (409)`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61: non-Coordinators can’t assign (%s → 403)`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61: a Coordinator not assigned to the event cannot assign`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61: an unauthenticated request is refused`<br>Unit: `src/events/events-technical-support.service.spec.ts::refuses a Coordinator who is not assigned to the event (403)`<br>Unit: `src/events/events-technical-support.service.spec.ts::lists nobody for an event with no date, and refuses to assign for it`<br>UI: `frontend/src/features/events/components/technical-support-card.test.tsx::US-61 AC-1: the Coordinator assigns an available member`<br>UI: `frontend/src/features/events/components/technical-support-card.test.tsx::US-61: the Coordinator can remove the assignment`<br>UI: `frontend/src/features/events/components/technical-support-card.test.tsx::US-61: read-only when not editable — no assign or remove controls` |

### TC-S4-77

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-77 |
| Story/AC ref | Story 61 AC-2 |
| Test Scenario | A member on an overlapping event is blocked and the conflict shown |
| Pre-conditions | Run test/fixtures/sql/tc-s4-76-setup.sql + tc-s4-77-setup.sql + tc-s4-76b-setup.sql + tc-s4-77b-setup.sql + tc-s4-77c-setup.sql on testDB (reset before test), as each step needs. Users from tc-s4-76-setup.sql only: Carla (carla@example.com) is the event's Coordinator, Colin another Coordinator, Lena the Lead, and Wei and Nadia the only two Technical Support members. The "Town Hall" (`EVT-304`, 1 Oct 2030 10:00–12:00 UTC) needs on-site support. Logged in as carla@example.com. tc-s4-77 (Wei on "Product Launch" 11:00–13:00), 77b (back to back), 77c (cancelled). |
| Test Steps | 1. Carla reads the screen, then assigns Wei.<br>2. Repeat with a back-to-back and a cancelled event. |
| Test Data | — |
| Expected Result | Blocked, naming the conflicting event and time; back to back and cancelled events are not conflicts. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | 409 "Wei Technical is already assigned to "Product Launch"…" with the conflict; the screen showed Wei unavailable with it; back to back and cancelled: 200. The card showed the conflict and disabled him. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-2: overlapping assignment blocked, naming the conflicting event and time`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-2: the assignment screen shows the conflict before anything is attempted`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-2: a back-to-back event is not a conflict`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-2: a cancelled event no longer holds its assignee`<br>Unit: `src/events/events-technical-support.service.spec.ts::names an unnamed overlapping event as "an event", and ignores assigned events with no dates`<br>UI: `frontend/src/features/events/components/technical-support-card.test.tsx::US-61 AC-2: a member on an overlapping event shows the conflict and cannot be chosen`<br>UI: `frontend/src/features/events/components/technical-support-card.test.tsx::US-61 AC-2: a conflict the server finds (taken in the meantime) is shown` |

### TC-S4-78

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-78 |
| Story/AC ref | Story 61 AC-3 |
| Test Scenario | The assigned member sees the event's date, time, venue and technical requirements in their own list |
| Pre-conditions | Run test/fixtures/sql/tc-s4-76-setup.sql + tc-s4-76b-setup.sql + tc-s4-78-setup.sql + tc-s4-77c-setup.sql on testDB (reset before test), as each step needs. Users from tc-s4-76-setup.sql only: Carla (carla@example.com) is the event's Coordinator, Colin another Coordinator, Lena the Lead, and Wei and Nadia the only two Technical Support members. The "Town Hall" (`EVT-304`, 1 Oct 2030 10:00–12:00 UTC) needs on-site support. Logged in as carla@example.com. tc-s4-78-setup.sql adds Harbour Hall and a microphone requirement. |
| Test Steps | 1. Carla assigns Wei.<br>2. Wei, Nadia and Carla read the assignment list. |
| Test Data | — |
| Expected Result | Wei sees the event with all four; nobody else sees it; ended events drop out. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Wei: Town Hall, 10:00–12:00, Harbour Hall approved, the AV need and 2 Lapel microphones; Nadia empty; a cancelled event gone; Carla 403. The list page showed each field. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-3: assigned staff sees date, time, venue and technical requirements`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-3: another member does not see someone else’s assignment`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-3: an event that has ended drops out of the list`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-3: only Technical Support can read an assignment list`<br>UI: `frontend/src/features/events/components/technical-support-card.test.tsx::US-61 AC-3: shows each event’s date, time, venue and technical requirements`<br>UI: `frontend/src/features/events/components/technical-support-card.test.tsx::US-61 AC-3: says so when there are no assignments` |

### TC-S4-79

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-79 |
| Story/AC ref | Story 61 AC-4 |
| Test Scenario | With nobody available, no assignment is made and the screen says no staff member is available |
| Pre-conditions | Run test/fixtures/sql/tc-s4-76-setup.sql + tc-s4-79-setup.sql + tc-s4-76b-setup.sql + tc-s4-79b-setup.sql on testDB (reset before test), as each step needs. Users from tc-s4-76-setup.sql only: Carla (carla@example.com) is the event's Coordinator, Colin another Coordinator, Lena the Lead, and Wei and Nadia the only two Technical Support members. The "Town Hall" (`EVT-304`, 1 Oct 2030 10:00–12:00 UTC) needs on-site support. Logged in as carla@example.com. tc-s4-79 (both busy), 79b (no Technical Support accounts). |
| Test Steps | 1. Read the screen with both busy; try to assign.<br>2. Read it with no members at all. |
| Test Data | — |
| Expected Result | The message is shown and nothing is assigned. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | `noneAvailable` with "No Technical Support staff member is available for this date and time."; assigning 409 with the message and no history; with no members the same message. The card said so and offered nothing. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-4: no-one available shows the message on the assignment screen`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-4: attempting to assign anyway makes no assignment and returns the message`<br>Integration: `test/us61-technical-support-assignment.e2e-spec.ts::US-61 AC-4: with no Technical Support accounts at all, the message is shown`<br>UI: `frontend/src/features/events/components/technical-support-card.test.tsx::US-61 AC-4: when nobody is available the screen says so and offers no assignment` |

**Story 61 AC ↔ code notes**
- No mismatches. A Coordinator not assigned to the event is refused before this check by the access layer (404).

## Story 62 Coordinator Responds to a Safety Check (Event Coordinator)

### TC-S4-80

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-80 |
| Story/AC ref | Story 62 AC-1 |
| Test Scenario | After changes are requested or a rejection, the event is with its Coordinator, not in the Safety queue, even with everything confirmed |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql + tc-s3-177e-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-300`) is Cody's, with Main Hall approved, and was confirmed into the Safety queue; Sam (sam.officer@example.com) then requested changes (venue, "Add an exit") or rejected it. tc-s4-80-setup.sql gives the same state for the browser test, with a plan edit since. Logged in as coord.a@example.com. |
| Test Steps | 1. Sam requests changes; read the queue twice.<br>2. Sam rejects; read the queue. |
| Test Data | — |
| Expected Result | Not queued in either case. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Changes: PLANNING, queue empty after two reads; rejection: SAFETY_REJECTED, queue empty. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::is held out of the queue, however complete its arrangements are, until the Coordinator answers`<br>Integration: `test/safety-check.e2e-spec.ts::blocks the event, takes it out of the queue, leaves its arrangements alone and tells the Coordinator why` |

### TC-S4-81

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-81 |
| Story/AC ref | Story 62 AC-2 |
| Test Scenario | The Coordinator sees the reasons, the stage to rework and the arrangements flagged |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql + tc-s3-177e-setup.sql + tc-s4-80-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-300`) is Cody's, with Main Hall approved, and was confirmed into the Safety queue; Sam (sam.officer@example.com) then requested changes (venue, "Add an exit") or rejected it. tc-s4-80-setup.sql gives the same state for the browser test, with a plan edit since. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody reads the reviews.<br>2. Cody opens the event page. |
| Test Data | — |
| Expected Result | Reason, stage and flagged arrangements are all shown to him. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Review: CHANGES_REQUESTED, "Add an exit", VENUE, [VENUE_BOOKING]; another Coordinator 404. The page said "asked for changes to the venue planning" and "the venue booking is flagged for re-review"; a rejection read "The whole plan is flagged". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::shows the Coordinator the reason, the stage to rework and what is flagged`<br>Integration: `test/safety-check.e2e-spec.ts::shows the checks and reasons to the event’s Coordinator, and to no other Coordinator`<br>E2E: `e2e/us62-safety-resubmit.spec.ts::sees the feedback, sends the event back with a note, and sees it waiting for a new check`<br>UI: `frontend/src/features/safety/components/safety-history.test.tsx::AC-2: a rejection names the reason and that the whole plan is flagged, with the notes on each factor` |

### TC-S4-82

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-82 |
| Story/AC ref | Story 62 AC-3 |
| Test Scenario | A rejected event must be taken back into planning before it can be sent back |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql + tc-s3-177e-setup.sql + tc-s3-185-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-300`) is Cody's, with Main Hall approved, and was confirmed into the Safety queue; Sam (sam.officer@example.com) then requested changes (venue, "Add an exit") or rejected it. tc-s4-80-setup.sql gives the same state for the browser test, with a plan edit since. Logged in as coord.a@example.com. tc-s3-185-setup.sql cancels it while feedback waits. |
| Test Steps | 1. After a rejection, Cody sends it back.<br>2. Resumes planning, edits, sends it back.<br>3. A cancelled event. |
| Test Data | — |
| Expected Result | Blocked until back in planning; a cancelled event cannot be sent back. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | 409, then 200 after start-planning and an edit, back in the queue; cancelled 409. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::cannot send back an event that was cancelled while the feedback waited`<br>Integration: `test/safety-check.e2e-spec.ts::is reworked by the Coordinator: resume planning, change the plan, send it back` |

### TC-S4-83

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-83 |
| Story/AC ref | Story 62 AC-4 |
| Test Scenario | Sending back with nothing changed is blocked, saying why |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql + tc-s3-177e-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-300`) is Cody's, with Main Hall approved, and was confirmed into the Safety queue; Sam (sam.officer@example.com) then requested changes (venue, "Add an exit") or rejected it. tc-s4-80-setup.sql gives the same state for the browser test, with a plan edit since. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody sends it back with no change. |
| Test Data | — |
| Expected Result | Blocked with the reason. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | 409 "…nothing has changed…"; still PLANNING. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::refuses to resubmit an event nothing has changed on` |

### TC-S4-84

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-84 |
| Story/AC ref | Story 62 AC-5 |
| Test Scenario | Sending back while a booking is pending or equipment is not fully reserved is blocked, showing the unmet condition |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql + tc-s3-177e-setup.sql + tc-s3-177c-setup.sql + tc-s3-177d-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-300`) is Cody's, with Main Hall approved, and was confirmed into the Safety queue; Sam (sam.officer@example.com) then requested changes (venue, "Add an exit") or rejected it. tc-s4-80-setup.sql gives the same state for the browser test, with a plan edit since. Logged in as coord.a@example.com. tc-s3-177c (a new pending booking), 177d (4 microphones needed). |
| Test Steps | 1. Add a pending booking; send back.<br>2. Need 4 microphones with none reserved; edit; send back. |
| Test Data | — |
| Expected Result | Blocked, naming the condition. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | 409 "…still pending…"; 409 "…requested equipment is not fully reserved…"; still PLANNING. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::counts a changed booking as a change, and a new one that is not yet approved as not ready`<br>Integration: `test/safety-check.e2e-spec.ts::blocks a send-back while requested equipment is not fully reserved, and says so` |

### TC-S4-85

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-85 |
| Story/AC ref | Story 62 AC-6 |
| Test Scenario | Confirmed and changed: the event returns to the Safety queue as a re-check, showing the earlier review |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql + tc-s3-177e-setup.sql + tc-s4-80-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-300`) is Cody's, with Main Hall approved, and was confirmed into the Safety queue; Sam (sam.officer@example.com) then requested changes (venue, "Add an exit") or rejected it. tc-s4-80-setup.sql gives the same state for the browser test, with a plan edit since. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody edits the plan and sends it back.<br>2. Sam reads the queue and the review, then approves. |
| Test Data | — |
| Expected Result | Back in the queue as a re-check with the earlier review. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | AWAITING_SAFETY_CHECK; queue `previousReviews` 1, last outcome CHANGES_REQUESTED; review history kept; then [CHANGES_REQUESTED, APPROVED]. The page showed it waiting for the Safety Officer. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::sends the event back to the Safety Officer once the plan has changed, as a re-check with the history kept`<br>E2E: `e2e/us62-safety-resubmit.spec.ts::sees the feedback, sends the event back with a note, and sees it waiting for a new check` |

### TC-S4-86

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-86 |
| Story/AC ref | Story 62 AC-7 |
| Test Scenario | An optional comment of up to 1000 characters; a blank one counts as none |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql + tc-s3-177e-setup.sql + tc-s4-80-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-300`) is Cody's, with Main Hall approved, and was confirmed into the Safety queue; Sam (sam.officer@example.com) then requested changes (venue, "Add an exit") or rejected it. tc-s4-80-setup.sql gives the same state for the browser test, with a plan edit since. Logged in as coord.a@example.com. |
| Test Steps | 1. Send back with "   ".<br>2. With 1001 characters.<br>3. With no comment. |
| Test Data | — |
| Expected Result | Blank is none; too long is refused; none is fine. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Blank stored as none with the time set; 1001 characters 400, still PLANNING; no comment accepted. The history showed no comment line. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::treats a blank comment as none, and the comment as optional`<br>Integration: `test/safety-check.e2e-spec.ts::refuses a comment that is too long and does not send the event back`<br>E2E: `e2e/us62-safety-resubmit.spec.ts::sees the feedback, sends the event back with a note, and sees it waiting for a new check`<br>UI: `frontend/src/features/safety/components/safety-history.test.tsx::AC-7/AC-8: a send-back with no note shows when it was sent, with no comment, and earlier checks stay listed` |

### TC-S4-87

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-87 |
| Story/AC ref | Story 62 AC-8 |
| Test Scenario | The comment and time are shown to the Safety Officer and the Coordinator beside the feedback; earlier reviews never change |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql + tc-s3-177e-setup.sql + tc-s4-80-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-300`) is Cody's, with Main Hall approved, and was confirmed into the Safety queue; Sam (sam.officer@example.com) then requested changes (venue, "Add an exit") or rejected it. tc-s4-80-setup.sql gives the same state for the browser test, with a plan edit since. Logged in as coord.a@example.com. |
| Test Steps | 1. Cody sends it back with a comment.<br>2. Sam opens the review; Cody reads his history. |
| Test Data | "Added a second exit at the rear…" |
| Expected Result | Shown beside the feedback to both, trimmed; the review itself unchanged. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Sam's review: CHANGES_REQUESTED, "Add an exit", comment trimmed; Cody saw it too. The page showed the comment and "sent it back for a new check on …". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::lets the Coordinator tell the Safety Officer what changed, and shows it with the feedback it answers`<br>E2E: `e2e/us62-safety-resubmit.spec.ts::sees the feedback, sends the event back with a note, and sees it waiting for a new check`<br>UI: `frontend/src/features/safety/components/safety-history.test.tsx::AC-7/AC-8: a send-back with no note shows when it was sent, with no comment, and earlier checks stay listed` |

### TC-S4-88

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-88 |
| Story/AC ref | Story 62 AC-9 |
| Test Scenario | Each piece of feedback can be answered once |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql + tc-s3-177e-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-300`) is Cody's, with Main Hall approved, and was confirmed into the Safety queue; Sam (sam.officer@example.com) then requested changes (venue, "Add an exit") or rejected it. tc-s4-80-setup.sql gives the same state for the browser test, with a plan edit since. Logged in as coord.a@example.com. |
| Test Steps | 1. Send back twice.<br>2. Send back with no feedback. |
| Test Data | — |
| Expected Result | The second attempt is blocked. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Second 409; with no feedback 409. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::cannot be resubmitted twice`<br>Integration: `test/safety-check.e2e-spec.ts::has nothing to answer when there is no feedback` |

### TC-S4-89

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-89 |
| Story/AC ref | Story 62 AC-10 |
| Test Scenario | Only the event's assigned Coordinator can send it back |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql + tc-s3-177e-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-300`) is Cody's, with Main Hall approved, and was confirmed into the Safety queue; Sam (sam.officer@example.com) then requested changes (venue, "Add an exit") or rejected it. tc-s4-80-setup.sql gives the same state for the browser test, with a plan edit since. Logged in as coord.a@example.com. |
| Test Steps | 1. Casey and other roles send it back. |
| Test Data | — |
| Expected Result | Refused for everyone else. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Casey 404; Sam, Olivia, Vera, Toby and Ann 403; still PLANNING. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::is the assigned Coordinator’s alone` |

**Story 62 AC ↔ code notes**
- Tested in the same file as Story 57 (test/safety-check.e2e-spec.ts); those tests carry both stories' TC IDs.
- The card's note says notifying the Safety Officer on re-queue is out of scope; US-64 does it.

## Story 63 Coordinators Alerted to Work Awaiting Review (Coordinator Lead / Coordinator)

### TC-S4-90

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-90 |
| Story/AC ref | Story 63 AC-1 |
| Test Scenario | A new event request notifies every Coordinator Lead, with a link to the request |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s4-90-setup.sql on testDB (reset before test), as each step needs. Olivia (organiser@example.com) submits through the API; Leah and Lars (lead@ / lead2@example.com) are the Coordinator Leads; Cody (coord.a@example.com) is a Coordinator. |
| Test Steps | 1. Olivia submits a request.<br>2. Olivia saves a draft, then submits it. |
| Test Data | — |
| Expected Result | Each Lead gets one notice naming and linking the request; a plain Coordinator gets none. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Leah and Lars one EVENT_SUBMITTED each, `relatedEventId` the request, message naming it; Cody none; a submitted draft notified both Leads. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/event-submitted-notification.e2e-spec.ts::records one EVENT_SUBMITTED notice per Lead, and none for a Coordinator`<br>Integration: `test/event-submitted-notification.e2e-spec.ts::notifies Leads when a draft is submitted via POST /events/:id/submit` |

### TC-S4-91

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-91 |
| Story/AC ref | Story 63 AC-2 |
| Test Scenario | A request sent back and submitted again notifies the Leads again |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s4-90-setup.sql on testDB (reset before test), as each step needs. Olivia (organiser@example.com) submits through the API; Leah and Lars (lead@ / lead2@example.com) are the Coordinator Leads; Cody (coord.a@example.com) is a Coordinator. |
| Test Steps | 1. Submit; Leah assigns Cody; Cody returns it.<br>2. Olivia submits it again. |
| Test Data | — |
| Expected Result | Each submission notifies the Leads. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Two EVENT_SUBMITTED each for Leah and Lars. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/event-submitted-notification.e2e-spec.ts::notifies the Leads again after a return and resubmission` |

### TC-S4-92

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-92 |
| Story/AC ref | Story 63 AC-3 |
| Test Scenario | A change notifies the assigned Coordinator; with none assigned, every Lead |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s4-90-setup.sql on testDB (reset before test), as each step needs. Olivia (organiser@example.com) submits through the API; Leah and Lars (lead@ / lead2@example.com) are the Coordinator Leads; Cody (coord.a@example.com) is a Coordinator. |
| Test Steps | 1. Change an assigned request.<br>2. Change an unassigned one. |
| Test Data | Attendance 450 |
| Expected Result | Assigned: only Cody. Unassigned: both Leads. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Assigned: Cody one EVENT_CHANGE_REQUESTED, no Lead; unassigned: Leah and Lars, not Cody. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/event-submitted-notification.e2e-spec.ts::notifies the assigned Coordinator — and no Lead — when the event is assigned`<br>Integration: `test/event-submitted-notification.e2e-spec.ts::falls back to every Lead when the event has no assigned Coordinator` |

### TC-S4-93

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-93 |
| Story/AC ref | Story 63 AC-4 |
| Test Scenario | Each notice names the event, says when a change was requested, and links to it |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s4-90-setup.sql on testDB (reset before test), as each step needs. Olivia (organiser@example.com) submits through the API; Leah and Lars (lead@ / lead2@example.com) are the Coordinator Leads; Cody (coord.a@example.com) is a Coordinator. |
| Test Steps | 1. Read the notices from TC-S4-90 and 92. |
| Test Data | — |
| Expected Result | Named, linked, and the change notice says "change". |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Messages named "Freshman Orientation 2030" with its id; the change notice said a change was requested. Unit: an unnamed event reads "an event". |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/event-submitted-notification.e2e-spec.ts::records one EVENT_SUBMITTED notice per Lead, and none for a Coordinator`<br>Integration: `test/event-submitted-notification.e2e-spec.ts::notifies Leads when a draft is submitted via POST /events/:id/submit`<br>Integration: `test/event-submitted-notification.e2e-spec.ts::notifies the assigned Coordinator — and no Lead — when the event is assigned`<br>Integration: `test/event-submitted-notification.e2e-spec.ts::falls back to every Lead when the event has no assigned Coordinator`<br>Unit: `src/events/events-request-notifier.service.spec.ts::words a change notice for an event with no name` |

### TC-S4-94

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-94 |
| Story/AC ref | Story 63 AC-5 |
| Test Scenario | Saving or editing a draft notifies no one |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s4-90-setup.sql on testDB (reset before test), as each step needs. Olivia (organiser@example.com) submits through the API; Leah and Lars (lead@ / lead2@example.com) are the Coordinator Leads; Cody (coord.a@example.com) is a Coordinator. |
| Test Steps | 1. Save a draft.<br>2. Edit it. |
| Test Data | — |
| Expected Result | No notification at all. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | No notification after either. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/event-submitted-notification.e2e-spec.ts::saving a draft records no notification`<br>Integration: `test/event-submitted-notification.e2e-spec.ts::editing a draft records no notification` |

### TC-S4-95

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-95 |
| Story/AC ref | Story 63 AC-6 |
| Test Scenario | Each notice is sent at the moment of submission, not on a delay |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql + tc-s4-90-setup.sql on testDB (reset before test), as each step needs. Olivia (organiser@example.com) submits through the API; Leah and Lars (lead@ / lead2@example.com) are the Coordinator Leads; Cody (coord.a@example.com) is a Coordinator. |
| Test Steps | 1. Submit, noting the time before and after. |
| Test Data | — |
| Expected Result | The notice is recorded within the submission. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | The notice's `createdAt` fell within the submission request. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/event-submitted-notification.e2e-spec.ts::records the notice within the submission request, not later` |

**Story 63 AC ↔ code notes**
- The card repeats the user story and an "Acceptance Criteria" heading as its first two bullets; the six real ACs are numbered AC-1 to AC-6 here.

## Story 64 Safety Officers Alerted When a Check Is Due (Safety Officer)

### TC-S4-96

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-96 |
| Story/AC ref | Story 64 AC-1 |
| Test Scenario | When an event enters the Safety queue, after confirmation or a resubmission, every Safety Officer is notified |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql + tc-s3-177e-setup.sql + tc-s3-177b-setup.sql on testDB (reset before test), as each step needs. Sam and Mei are the only Safety Officers; "Careers Fair" (`EVT-300`) has Main Hall approved, and Cody (coord.a@example.com) confirms it into the Safety queue. Variant: tc-s3-177b (a pending booking). |
| Test Steps | 1. Cody confirms.<br>2. A confirmation is refused.<br>3. After feedback, Cody resubmits. |
| Test Data | — |
| Expected Result | Every Safety Officer, and nobody else, each time it enters; nobody when it does not. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Sam and Mei once each on confirmation; nobody when refused; once more each after the resubmission. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::AC1: Given two Safety Officers, When the Coordinator confirms, Then each is alerted once, and nobody else`<br>Integration: `test/safety-check.e2e-spec.ts::AC1: Given the confirmation is refused, Then nobody is alerted`<br>Integration: `test/safety-check.e2e-spec.ts::AC1: Given feedback answered with a changed plan, When the Coordinator resubmits, Then every Safety Officer is alerted again`<br>Unit: `src/notifications/safety-check-notifier.service.spec.ts::Given a failure that is not an Error object, Then it is swallowed too` |

### TC-S4-97

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-97 |
| Story/AC ref | Story 64 AC-2 |
| Test Scenario | The notice shows the event name and date |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql + tc-s3-177e-setup.sql on testDB (reset before test), as each step needs. Sam and Mei are the only Safety Officers; "Careers Fair" (`EVT-300`) has Main Hall approved, and Cody (coord.a@example.com) confirms it into the Safety queue. |
| Test Steps | 1. Cody confirms. |
| Test Data | — |
| Expected Result | "Safety check due: <name> on <date>". |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | "Safety check due: Careers Fair on 1 Oct 2030" (the Singapore date). Unit: no name or no date still reads as a sentence. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::AC2: Given a dated event, When it enters the queue, Then the alert names the event and its date`<br>Unit: `src/notifications/safety-check-notifier.service.spec.ts::Given an event with no date, Then the message names the event alone` |

### TC-S4-98

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-98 |
| Story/AC ref | Story 64 AC-3 |
| Test Scenario | Opening the notice takes the Safety Officer to the event's safety check page |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql + tc-s3-177e-setup.sql on testDB (reset before test), as each step needs. Sam and Mei are the only Safety Officers; "Careers Fair" (`EVT-300`) has Main Hall approved, and Cody (coord.a@example.com) confirms it into the Safety queue. |
| Test Steps | 1. Mei reads her inbox. |
| Test Data | — |
| Expected Result | Linked to the safety check page. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Unread SAFETY_CHECK_DUE for Careers Fair, linking to `/safety/checks/EVT-300`. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::AC1: the alert is in the officer’s inbox, titled by type and linked to the existing safety check page` |

### TC-S4-99

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-99 |
| Story/AC ref | Story 64 AC-4 |
| Test Scenario | Each time the event enters the queue, each Safety Officer is notified once |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s3-177-setup.sql + tc-s3-177e-setup.sql on testDB (reset before test), as each step needs. Sam and Mei are the only Safety Officers; "Careers Fair" (`EVT-300`) has Main Hall approved, and Cody (coord.a@example.com) confirms it into the Safety queue. |
| Test Steps | 1. Confirm; send back; resubmit. |
| Test Data | — |
| Expected Result | Once each per entry. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Two notices each for Sam and Mei after two entries; one each after one. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/safety-check.e2e-spec.ts::AC1: Given two Safety Officers, When the Coordinator confirms, Then each is alerted once, and nobody else`<br>Integration: `test/safety-check.e2e-spec.ts::AC1: Given feedback answered with a changed plan, When the Coordinator resubmits, Then every Safety Officer is alerted again` |

**Story 64 AC ↔ code notes**
- Tested in test/safety-check.e2e-spec.ts beside Story 57 and 62.

## Story 65 Organisers Get Confirmation and Visibility on Their Own Events (Event Organiser)

### TC-S4-100

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-100 |
| Story/AC ref | Story 65 AC-1 |
| Test Scenario | When a Lead assigns a Coordinator, the Organiser is told the Coordinator's name |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql + tc-s3-160-setup.sql on testDB (reset before test), as each step needs. Users from tc-s3-159-setup.sql: Olive the Organiser, Lena the Lead, Marcus and Fatima the Coordinators. tc-s3-160-setup.sql: a queued request. |
| Test Steps | 1. Lena assigns Marcus.<br>2. She tries to assign it again. |
| Test Data | — |
| Expected Result | Olive told once, with Marcus's name. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | "Marcus is now the coordinator for "Freshman Orientation 2030"." in Olive's inbox, linked to her request; the refused second assignment sent nothing more. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::notifies the assigned Coordinator`<br>Integration: `test/events-assignment.e2e-spec.ts::US-65: tells the Organiser who their coordinator now is, in their inbox`<br>Integration: `test/events-assignment.e2e-spec.ts::US-65 AC1: Given the event is already assigned, When a Lead assigns it again, Then the Organiser is not notified again` |

### TC-S4-101

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-101 |
| Story/AC ref | Story 65 AC-2 |
| Test Scenario | When the event is reassigned, the Organiser is told the new Coordinator's name |
| Pre-conditions | Run test/fixtures/sql/tc-s3-159-setup.sql + tc-s3-170-setup.sql on testDB (reset before test), as each step needs. Users from tc-s3-159-setup.sql: Olive the Organiser, Lena the Lead, Marcus and Fatima the Coordinators. tc-s3-170-setup.sql: Marcus's event. |
| Test Steps | 1. Lena reassigns it to Fatima. |
| Test Data | — |
| Expected Result | Olive is told Fatima's name. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | "Your coordinator for "Freshman Orientation 2030" is now Fatima." |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/events-assignment.e2e-spec.ts::notifies both the previous and the new Coordinator` |

### TC-S4-102

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-102 |
| Story/AC ref | Story 65 AC-3 |
| Test Scenario | Cancelling my own event sends me a confirmation with the event name |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s4-102-setup.sql + tc-s4-102b-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-311`, CONFIRMED) is Olivia's (organiser@example.com) and Cody's, with Main Hall, 2 + 3 microphones and Ann registered. tc-s4-102b: the event already took place. |
| Test Steps | 1. Olivia cancels with a reason.<br>2. She reads her inbox.<br>3. A refused cancellation. |
| Test Data | "Speaker withdrew" |
| Expected Result | A confirmation naming the event, what was released and the reason; the others' notice unchanged; nothing when refused. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | "You cancelled "Careers Fair". 1 venue booking and 2 equipment reservations were released. Reason: Speaker withdrew", in her inbox with the reason apart, linked to her event; Cody and Ann kept their notice; a refused cancellation sent nothing. The panel's toast said what was released. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/events-cancel-confirmation.e2e-spec.ts::confirms the cancellation to the Organiser, with what was released and their reason`<br>Integration: `test/events-cancel-confirmation.e2e-spec.ts::shows in the Organiser’s inbox with the reason on its own line, linked to their event`<br>Integration: `test/events-cancel-confirmation.e2e-spec.ts::keeps the Coordinator’s and Attendees’ notice as it was, and does not count the Organiser in it`<br>Integration: `test/events-cancel-confirmation.e2e-spec.ts::sends nothing when the cancellation is refused`<br>UI: `frontend/src/features/events/components/cancel-event-panel.test.tsx::US-65 AC2: Given the server cancels it, Then a toast confirms what was released`<br>UI: `frontend/src/features/events/components/cancel-event-panel.test.tsx::US-65: Given nothing was held, Then the toast says so`<br>UI: `frontend/src/features/events/components/cancel-event-panel.test.tsx::US-65: Given the server refuses, Then no success toast is shown` |

### TC-S4-103

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-103 |
| Story/AC ref | Story 65 AC-4 |
| Test Scenario | An Organiser who is also a registered Attendee gets only one cancellation notice |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s4-102-setup.sql + tc-s4-103-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-311`, CONFIRMED) is Olivia's (organiser@example.com) and Cody's, with Main Hall, 2 + 3 microphones and Ann registered. tc-s4-103-setup.sql: Olivia registered too. |
| Test Steps | 1. Olivia cancels. |
| Test Data | — |
| Expected Result | Exactly one notice, the confirmation. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | One notice to Olivia ("You cancelled…"); 2 others notified. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/events-cancel-confirmation.e2e-spec.ts::AC2: Given the Organiser is also registered as an attendee, When they cancel, Then they get exactly one notice` |

**Story 65 AC ↔ code notes**
- AC-1 and AC-2 are tested in test/events-assignment.e2e-spec.ts (Stories 55/56); AC-3 and AC-4 in test/events-cancel-confirmation.e2e-spec.ts.

## Story 66 Assigned Tech Support Receive Equipment Notifications (Technical Support)

### TC-S4-104

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-104 |
| Story/AC ref | Story 66 AC-1 |
| Test Scenario | When an event with live reservations is cancelled or rejected, the assigned Tech Support member is notified |
| Pre-conditions | Run test/fixtures/sql/tc-s4-76-setup.sql + tc-s4-104-setup.sql + tc-s4-104d-setup.sql + tc-s4-104e-setup.sql + tc-s4-104f-setup.sql + tc-s4-104b-setup.sql + tc-s4-104g-setup.sql on testDB (reset before test), as each step needs. Users from tc-s4-76-setup.sql (Olga, Carla, and Wei and Nadia, the only two Technical Support members) and tc-s4-104-setup.sql ("Town Hall" `EVT-312`, Wei assigned, Main Hall managed by Vanessa, projectors). Variants: 104d/104e/104f (reservations), 104b (nobody assigned), 104g (Main Hall approved). |
| Test Steps | 1. Cancel, and reject, with and without live reservations.<br>2. With nobody assigned. |
| Test Data | — |
| Expected Result | Only the assignee is told what was released, and only when something was; the venue manager's notice still goes. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | "Event cancelled. Released: 2 × Projector." / "Event rejected as unfulfillable. Released: 3 × Projector." to Wei; nothing without live reservations or an assignee; Nadia nothing; Vanessa got her venue notice. The inbox showed it. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-1: cancel notifies the assigned staff when the event has live reservations`<br>Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-1: cancel with no live reservations notifies no one`<br>Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-1: reject notifies the assigned staff when the event has live reservations`<br>Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-1: reject with no live reservations notifies no one`<br>Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-1: no notification when nobody is assigned`<br>Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-1: only the assignee hears — other Technical Support do not`<br>Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-1: the venue manager’s US-40 notice is still sent alongside`<br>UI: `frontend/src/features/notifications/components/technical-support-notices.test.tsx::US-66 %s: %s shows its title and detail, beside the event, linking to its requirements` |

### TC-S4-105

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-105 |
| Story/AC ref | Story 66 AC-2 |
| Test Scenario | When an approved change rebooks a reservation to a new time, the assigned member is notified |
| Pre-conditions | Run test/fixtures/sql/tc-s4-76-setup.sql + tc-s4-104-setup.sql + tc-s4-105-setup.sql + tc-s4-104d-setup.sql + tc-s4-105b-setup.sql + tc-s4-104b-setup.sql + tc-s4-104g-setup.sql on testDB (reset before test), as each step needs. Users from tc-s4-76-setup.sql (Olga, Carla, and Wei and Nadia, the only two Technical Support members) and tc-s4-104-setup.sql ("Town Hall" `EVT-312`, Wei assigned, Main Hall managed by Vanessa, projectors). tc-s4-105 (confirmed), 105b (a pending move a day later). |
| Test Steps | 1. Carla approves the move.<br>2. Repeat with nobody assigned, and nothing reserved. |
| Test Data | — |
| Expected Result | Wei is told the old and new time and what moved. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | "Time 1 Oct, 10:00–12:00 UTC → 2 Oct, 10:00–12:00 UTC. … Rebooked: 2 × Projector." to Wei; nothing when unassigned or nothing to move; Vanessa got her venue notice. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-2: rebook on change approval notifies the assigned staff with the old and new time`<br>Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-2: no notification when nobody is assigned`<br>Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-2: no notification when there was nothing to rebook`<br>Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-2: the venue manager’s US-40 notice is still sent alongside` |

### TC-S4-106

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-106 |
| Story/AC ref | Story 66 AC-3 |
| Test Scenario | An equipment request before assignment goes to the whole Tech Support pool |
| Pre-conditions | Run test/fixtures/sql/tc-s4-76-setup.sql + tc-s4-104-setup.sql + tc-s4-104b-setup.sql + tc-s4-104c-setup.sql on testDB (reset before test), as each step needs. Users from tc-s4-76-setup.sql (Olga, Carla, and Wei and Nadia, the only two Technical Support members) and tc-s4-104-setup.sql ("Town Hall" `EVT-312`, Wei assigned, Main Hall managed by Vanessa, projectors). 104b (nobody assigned), 104c (Nadia assigned). |
| Test Steps | 1. Carla sets the requirements with nobody assigned, then with Nadia.<br>2. Saves again unchanged.<br>3. Wei reads his inbox. |
| Test Data | — |
| Expected Result | The pool before assignment, only the assignee after, nothing for an unchanged save, linked to the requirements. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Wei and Nadia, then only Nadia; nothing on an unchanged save; linked to `/equipment/requirements/EVT-312`. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-3: equipment request submitted notifies all Tech Support while nobody is assigned`<br>Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-3: once someone is assigned, only the assignee is notified`<br>Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-3: a save that changes nothing sends nothing`<br>Integration: `test/us66-technical-support-notifications.e2e-spec.ts::US-66 AC-3: the notice links Technical Support to the event’s requirements`<br>Unit: `src/equipment/technical-support-notifier.spec.ts::US-66 AC-3: an event that has gone notifies no one` |

**Story 66 AC ↔ code notes**
- No mismatches.

## Story 67 Coordinators Told When Equipment Affecting Their Event Changes (Event Coordinator)

### TC-S4-107

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-107 |
| Story/AC ref | Story 67 AC-1 |
| Test Scenario | Marking an item damaged with upcoming committed reservations notifies each affected event's Coordinator once, falling back to the Leads |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s4-110-setup.sql + tc-s4-110i-setup.sql + tc-s4-110j-setup.sql + tc-s4-110k-setup.sql + tc-s4-110b-setup.sql + tc-s4-110m-setup.sql + tc-s4-110n-setup.sql + tc-s4-110o-setup.sql on testDB (reset before test), as each step needs. "gala" (`EVT-313`, CONFIRMED, Cody's) has 2 wireless microphones reserved (`RSV-038`); lapel microphones are free. Toby (tech.support@example.com) changes the status; Cody (coord.a@example.com) decides. Variants: 110b (an event in planning), 110i–k (finished), 110m (already out of service). |
| Test Steps | 1. Toby marks the microphones damaged with a live and a finished event.<br>2. With an event in planning. |
| Test Data | "Cracked casing." |
| Expected Result | Each live event's Coordinator told once; finished events not told. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | The live event's Coordinator told, with the item and reason; finished events got no notice, flag or question. Unit: one per event, the Leads when unassigned, and nobody (logged) when there is no one. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/equipment-substitutions.e2e-spec.ts::a %s event gets no notice, no flag and needs no replacement`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::still warns about, and notifies, a live event using the same item`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::marks the item unavailable without one, as before`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::requires an answer only for the confirmed one when both are affected`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::400s on an answer for a reservation that needs none`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::notifies the Coordinator with the suggestion and shows it beside the flag`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::says plainly when there is no valid alternative`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::lets Technical Support answer afterwards, and tells the Coordinator`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::409s a second answer for the same reservation`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::409s when the event is not confirmed`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::409s when the item is in service`<br>Unit: `src/equipment/equipment-notifier.spec.ts::words every notice for an event with no name as "an event"`<br>UI: `frontend/src/features/events/components/equipment-unavailable-notice.test.tsx::flags each affected item with its status, as an alert` |

### TC-S4-108

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-108 |
| Story/AC ref | Story 67 AC-2 |
| Test Scenario | When a committed reservation is released because the event was cancelled or rejected, the Coordinator is notified |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s4-102-setup.sql on testDB (reset before test), as each step needs. "Careers Fair" (`EVT-311`, CONFIRMED) is Olivia's (organiser@example.com) and Cody's, with Main Hall, 2 + 3 microphones and Ann registered. |
| Test Steps | 1. Olivia cancels the Careers Fair.<br>2. (Rejection: in events-reject-unfulfillable.) |
| Test Data | — |
| Expected Result | Cody is told the equipment was released and why. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | One EQUIPMENT_RELEASED to Cody naming Careers Fair and "cancelled"; on a rejection, to the Coordinator as unfulfillable. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/events-cancel-confirmation.e2e-spec.ts::US-67 AC-2: tells the event’s Coordinator that its equipment was released`<br>Unit: `src/equipment/equipment-notifier.spec.ts::words every notice for an event with no name as "an event"` |

### TC-S4-109

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-109 |
| Story/AC ref | Story 67 AC-3 |
| Test Scenario | Recipient resolution mirrors the hold notifier |
| Pre-conditions | "gala" (`EVT-313`, CONFIRMED, Cody's) has 2 wireless microphones reserved (`RSV-038`); lapel microphones are free. Toby (tech.support@example.com) changes the status; Cody (coord.a@example.com) decides. |
| Test Steps | 1. Notify an assigned and an unassigned event. |
| Test Data | — |
| Expected Result | The Coordinator, else every Lead, else nobody (logged). |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | Unit: the Coordinator; every Lead when unassigned; nobody, without failing, when there is neither. |
| Status | Pass |
| Remarks | A reservation exists only once an event is in planning, which always has a Coordinator, so the Lead fall-back is proven in the unit test. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Unit: `src/equipment/equipment-notifier.spec.ts::falls back to every Coordinator Lead when the event is unassigned`<br>Unit: `src/equipment/equipment-notifier.spec.ts::skips without throwing when there is no coordinator and no lead` |

### TC-S4-110

| Test case specification | |
|---|---|
| Test Case ID | TC-S4-110 |
| Story/AC ref | Story 67 AC-4 |
| Test Scenario | After an event is confirmed, the Coordinator can accept or reject Tech Support's suggested alternative for unavailable equipment |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s4-110-setup.sql + tc-s4-110h-setup.sql + tc-s4-110b-setup.sql + tc-s4-110e-setup.sql + tc-s4-110l-setup.sql + tc-s4-110f-setup.sql + tc-s4-110c-setup.sql + tc-s4-110q-setup.sql + tc-s4-110d-setup.sql + tc-s4-110g-setup.sql + tc-s4-110m-setup.sql + tc-s4-110p-setup.sql + tc-s4-110n-setup.sql + tc-s4-110o-setup.sql on testDB (reset before test), as each step needs. "gala" (`EVT-313`, CONFIRMED, Cody's) has 2 wireless microphones reserved (`RSV-038`); lapel microphones are free. Toby (tech.support@example.com) changes the status; Cody (coord.a@example.com) decides. Variants: tc-s4-110c to 110h, 110l, 110n to 110q. |
| Test Steps | 1. Toby marks the microphones damaged with and without an answer, a bad answer, or from the dropdown.<br>2. Cody accepts or declines; other users try.<br>3. The item comes back; answers after the fact. |
| Test Data | — |
| Expected Result | An answer is required for a confirmed event; only valid replacements; the Coordinator accepts (rebooked) or declines (acknowledged); only once, only theirs. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-29 |
| **Test execution record** | |
| Actual Result | No answer 400; "no valid alternative" accepted; short, out-of-service, same-item or overdrawn alternatives refused; the dropdown listed fully free items, same type first, by id; accepting rebooked on the lapel microphones, released the original, repointed the requirement, cleared the flag and told Technical Support; declining kept the reservation, flagged as acknowledged; a second decision, another Coordinator (404) or other roles (403) refused; changes since the suggestion refused; returning to service voided it. The panels offered Accept/Decline or Acknowledge. |
| Status | Pass |
| Remarks | Three backstops the app cannot reach are covered by unit tests with a mocked database (see coverage-s4.md). |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-29 |
| Automated by | Integration: `test/equipment-substitutions.e2e-spec.ts::400s with no substitution, and leaves the item in service with no change recorded`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::accepts a replacement from the catalogue and records it PENDING`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::accepts "no valid alternative" as an answer`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::also requires one for a merely requested reservation on a confirmed event`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::400s on %s`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::404s and leaves the item in service`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::marks the item unavailable without one, as before`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::requires an answer only for the confirmed one when both are affected`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::400s on an answer for a reservation that needs none`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::409s, saving nothing, when the alternative cannot cover the same quantity`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::409s when the alternative is itself out of service`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::400s when an item is offered as its own replacement`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::409s when two reservations would together overdraw the one alternative`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::lists alternatives of one type by id, after sorting by type`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::leaves out an item another event holds too much of, and 404s an unknown reservation`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::lists items with the full quantity free, same type first, never the item itself`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::is closed to the Coordinator`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::notifies the Coordinator with the suggestion and shows it beside the flag`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::says plainly when there is no valid alternative`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::rebooks the same quantity and window on the alternative and releases the original`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::repoints the matching required-equipment line at the alternative`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::splits a larger line, moving only the swapped quantity to the alternative`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::leaves the event ready to confirm: the new line counts as reserved`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::clears the flag, and tells Technical Support`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::cannot be decided twice`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::409s, staying PENDING, when the alternative has filled up since; declining still works`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::409s when the alternative has since gone out of service`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::409s when the event is no longer confirmed`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::409s once the reservation is released, or the original item is back in service`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::keeps the reservation, marks it DECLINED and leaves the flag with them`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::is the only answer to "no valid alternative": accepting is refused`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::is final: it cannot be accepted afterwards, nor re-suggested`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::%s: another Coordinator gets 404`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::%s: other roles get 403`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::needs a login`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::voids a waiting proposal, and a later outage asks again`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::closes a decline too, so the next outage is a fresh question`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::lets Technical Support answer afterwards, and tells the Coordinator`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::refuses answers that cannot stand: unknown or released reservation, an unknown item, both choices`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::409s a second answer for the same reservation`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::409s when the event is not confirmed`<br>Integration: `test/equipment-substitutions.e2e-spec.ts::409s when the item is in service`<br>Unit: `src/equipment/equipment-notifier.spec.ts::words every notice for an event with no name as "an event"`<br>UI: `frontend/src/features/equipment/components/substitution-picker.test.tsx::requires a replacement choice before the item can be marked damaged`<br>UI: `frontend/src/features/equipment/components/substitution-picker.test.tsx::sends the chosen replacement with the status change`<br>UI: `frontend/src/features/equipment/components/substitution-picker.test.tsx::sends noAlternative when nothing fits, and says so when the list is empty`<br>UI: `frontend/src/features/events/components/equipment-unavailable-substitution.test.tsx::shows the suggested replacement with Accept and Decline for the Coordinator`<br>UI: `frontend/src/features/events/components/equipment-unavailable-substitution.test.tsx::accepts the replacement`<br>UI: `frontend/src/features/events/components/equipment-unavailable-substitution.test.tsx::declines and acknowledges`<br>UI: `frontend/src/features/events/components/equipment-unavailable-substitution.test.tsx::offers only Acknowledge when there is no valid alternative`<br>Unit: `src/equipment/equipment-substitutions.service.spec.ts::refuses to accept when the alternative is missing inside the transaction`<br>Unit: `src/equipment/equipment-substitutions.service.spec.ts::refuses a suggestion whose item cannot be read after it was locked`<br>Unit: `src/equipment/equipment-substitutions.service.spec.ts::names the Coordinator "The Event Coordinator" when their name cannot be read` |

**Story 67 AC ↔ code notes**
- AC-3 (fall back to the Leads) is unreachable through the app and proven by the unit test (TC-S4-109).
- AC-4 is Felecia's equipment-substitution work, converted to setup scripts with its 59 assertions unchanged.
