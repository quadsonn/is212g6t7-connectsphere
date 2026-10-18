# Sprint 1 test audit — traceability map

Scope: Sprint 1 stories US-01 to US-15 only, as committed on `sprint3-RAYE` (`d8ae390`). Generated tests parked on `sprint3-raye-BACKUP` are **not** counted. Read-only audit: no test was changed.

## Summary

| Story | Title | Unit | Integration (e2e) | Total | Gaps | Weak / noise items |
|---|---|---:|---:|---:|---|---|
| US-01 | Log in securely | 15 | 21 | 36 | AC-3 redirect is API-only (no UI test); 401 filter has no unit test | — |
| US-02 | Role-appropriate access | 48 | 29 | 77 | AC-4 menus are API-only (no UI test) | 1 weak |
| US-03 | Submit event request | 13 | 21 | 34 | AC-3 boundaries missing (end = start, attendance = 1, "just past"); whitespace accepted | — |
| US-04 | Save as draft | 21 | 20 | 41 | AC-3 "visually distinguishable" is API-only | — |
| US-05 | View request status | 27 | 16 | 43 | — | 1 oversized table |
| US-06 | Layout & accessibility | 15 | 23 | 38 | — | — |
| US-07 | Review & approve | 30 | 21 | 51 | Concurrent approve/reject untested (known race) | 1 oversized table |
| US-08 | Reject / return with reason | 22 | 24 | 46 | AC-2 whitespace-only reason: misleading test, defect | 1 misleading test |
| US-09 | Request clarification | 29 | 25 | 54 | AC-1 whitespace-only question accepted | — |
| US-10 | Assign coordinator | 27 | 21 | 48 | Allowed statuses only checked with `toBeDefined` | 5 weak |
| US-11 | Status updates automatically | 44 | 0 | 44 | No integration test of its own (covered indirectly by US-05/07/08/09) | 1 noise |
| US-12 | Coordinator views details | 16 | 21 | 37 | — | — |
| US-13 | Add venue | 26 | 24 | 50 | — | — |
| US-14 | Update venue | 28 | 21 | 49 | — | 1 weak |
| US-15 | Browse venue catalogue | 20 | 25 | 45 | AC-2 detail read has no unit test (e2e only) | — |
| **Total** | | **381** | **312** | **693** | | **8 weak / noise + 2 oversized tables** |

Plus 2 infrastructure smoke tests not tied to a story (`src/app.module.spec.ts`, `test/app.e2e-spec.ts`).

For context, the committed suite is 973 unit + 606 e2e tests; the rest belong to Sprint 2–3 stories. 65 tests inside Sprint 1 files that belong to later stories (US-17, 18, 25, 32, 33, attendee registration) were excluded.

**Frontend:** no Sprint 1 frontend tests exist on this branch. The two committed frontend tests cover US-24 and a shared date-time field.

## How this was built

- **Unit counts** are exact, taken from `npx jest --json` (with `.each` rows expanded).
- **e2e counts** are static: each `it` call with its `.each` rows expanded. There are no variable `.each` tables in these files, so the count is exact. The e2e suite was not run.
- **AC mapping:** each test is assigned by its `describe` title. The team labels nearly every group `AC-n`, and the numbering matches the bullet order in the Sprint 1 story document.
- **Groups without an AC label** were mapped by hand, using these codes:
  - **matrix row**: the story's rows in `permission-matrix.spec.ts`.
  - **perm**: a role or ownership gate applied to that story (US-02 rules in use).
  - **route**: a route-resolution check, such as `/mine` not being read as an id.

## Per-story AC map

Counts are given as unit / e2e.

### US-01 Log in securely
Unit: `src/auth/auth.service.spec.ts`. e2e: `test/auth.e2e-spec.ts`.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 valid login → session | 3 | 3 | |
| AC-2 generic error | 3 | 6 | e2e includes 3 DTO-validation tests |
| AC-3 protected page → login, no data | 0 | 4 | API returns 401 with no body. `loginUrl` is asserted only in `access-control.e2e` AC-8. |
| AC-4 logout ends session | 3 | 3 | |
| AC-5 lockout at 15 / 30 min | 6 | 5 | Boundaries 14/15 and window expiry are covered |

### US-02 Role-appropriate access
Unit: `permission-matrix.spec.ts`, `roles.guard.spec.ts`, `access-control.service.spec.ts`. e2e: `test/access-control.e2e-spec.ts`.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 default-deny | 10 (+2 shared with AC-2) | 3 | |
| AC-2 granted succeeds | 8 | 3 | |
| AC-3 rejected by the server, not just the UI | 2 | 3 | |
| AC-4 only granted menus | 3 | 5 | Tested through `GET /auth/me/permissions` only. The UI menu itself is untested. |
| AC-5 Organiser sees own only | 5 (+4 shared with AC-6) | 3 | One weak test (see Action items) |
| AC-6 Coordinator sees assigned only | 4 | 3 | |
| AC-7 Attendee sees public info only | 8 | 5 | |
| AC-8 unauthenticated → denied, pointed to login | 2 | 4 | |

### US-03 Submit event request
Unit: `events.service.spec.ts` and matrix rows. e2e: `test/events-submit.e2e-spec.ts`.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 valid → SUBMITTED | 6 | 5 | |
| AC-2 confirmation, visible to Coordinators | 0 | 3 | |
| AC-3 invalid input blocked, each field flagged | 0 | 8 | Partial boundaries only (see Gaps) |
| AC-4 details and status shown | 3 | 3 | |
| AC-5 attendance stored as a positive whole number | 1 | 2 | |
| matrix row | 3 | 0 | |

### US-04 Save as draft
Unit: `events-draft.service.spec.ts` and matrix rows. e2e: `test/events-draft.e2e-spec.ts`.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 save without submit validation | 5 | 6 | |
| AC-2 reopen and continue | 3 | 3 | |
| AC-3 marked "Draft", distinguishable | 0 | 2 | API status value only; no UI test |
| AC-4 draft → submitted | 5 | 5 | |
| AC-5 submitted is not editable | 4 | 4 | |
| matrix row | 4 | 0 | |

### US-05 View request status
Unit: `events-status-view.service.spec.ts` and matrix rows. e2e: `test/events-status-view.e2e-spec.ts`.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 each status displayed | 13 | 4 | Unit includes a 12-row table |
| AC-2 rejection reason shown | 2 | 2 | |
| AC-3 clarification shown with question | 3 | 3 | |
| AC-4 latest valid state | 4 | 3 | |
| AC-5 other Organisers' requests hidden | 2 | 3 | |
| matrix row / route | 3 | 1 | |

### US-06 Layout & accessibility
Unit: `events-layout.service.spec.ts` and matrix rows. e2e: `test/events-layout.e2e-spec.ts`.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 layout from predefined list | 3 (shared with AC-2) | 6 | |
| AC-2 free-text layout notes | — | 2 | |
| AC-3 accessibility requirements and notes | 3 | 6 | |
| AC-4 persists on draft or submit | 3 | 3 | |
| AC-5 empty is not a blocker | 3 | 3 | |
| AC-6 visible to the reviewing Coordinator | 0 | 3 | |
| matrix row | 3 | 0 | |

### US-07 Review & approve
Unit: `events-review.service.spec.ts` and matrix rows. e2e: `test/events-review.e2e-spec.ts`.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 status displayed | 14 | 7 | Unit includes a 12-row table |
| AC-2 all details displayed | 1 | 1 | |
| AC-3 Approve → APPROVED | 8 | 7 | Includes refusals for DRAFT and CANCELLED, and idempotency |
| perm (assigned Coordinator only) | 3 | 6 | |
| matrix row | 4 | 0 | |

### US-08 Reject / return with reason
Unit: `events-decision.service.spec.ts` and matrix rows. e2e: `test/events-decision.e2e-spec.ts`.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 separate Reject and Return actions | 6 (shared with AC-3) | 4 | |
| AC-2 reason required | 0 | 5 | One test is titled "…or whitespace-only" but only sends `''` |
| AC-3 status → REJECTED / RETURNED | 5 | 5 | e2e includes the full return → amend → approve round trip |
| AC-4 reason retained | 3 | 4 | |
| perm / matrix row | 5 / 3 | 6 / 0 | |

### US-09 Request clarification
Unit: `events-clarification.service.spec.ts`, `notifications.service.spec.ts` and matrix rows. e2e: `test/events-clarification.e2e-spec.ts`.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 text field for the question | 0 | 3 | API level only |
| AC-2 tied to the event | 3 | 2 | |
| AC-3 AWAITING_CLARIFICATION for both parties | 5 | 4 | |
| AC-4 Coordinator notified of the response | 10 (+5 shared with AC-5) | 7 | Unit count includes the 5 notification-service tests |
| AC-5 timestamped audit trail | — | 5 | |
| perm / matrix row | 3 / 3 | 4 / 0 | |

### US-10 Assign coordinator
Unit: `events-assign.service.spec.ts` and matrix rows. e2e: `test/events-assign.e2e-spec.ts`.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 linked as main contact | 10 (+8 shared with AC-2) | 12 | 5 of the shared tests are weak (see Action items) |
| AC-2 reassignment | 3 | 4 | |
| AC-3 visible to authorised users | 2 | 5 | |
| matrix row | 4 | 0 | |

### US-11 Status updates automatically
Unit: `event-status.machine.spec.ts`, `events-status-audit.spec.ts`, and `events.service.spec.ts` (setStatus). No e2e file.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 one status at all times | 11 | 0 | Includes 1 noise test |
| AC-2 rejection decision and reason shown | 6 | 0 | Also covered indirectly by US-05 AC-2 e2e |
| AC-3 status follows other stories' actions | 27 | 0 | Transition table, setStatus, single-writer audit. Indirectly covered by US-05 AC-4, US-07 AC-3, US-08 AC-3 and US-09 AC-3 e2e. |

### US-12 Coordinator views details
Unit: `events-coordinator-view.service.spec.ts` and matrix rows. e2e: `test/events-coordinator-view.e2e-spec.ts`.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 core details | 4 | 5 | |
| AC-2 equipment and registration requirements | 3 | 6 | |
| AC-3 unassociated users get no data | 6 | 9 | Includes review-pool interaction |
| matrix row / route | 3 | 1 | |

### US-13 Add venue
Unit: `venues.service.spec.ts` and matrix rows. e2e: `test/venues.e2e-spec.ts`.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 all characteristics | 2 | 3 | |
| AC-2 save incomplete as draft | 5 | 5 | |
| AC-3 publish blocked until complete | 7 | 3 | |
| AC-4 drafts visible only to their manager | 8 | 6 | |
| AC-5 published appears in catalogue | 0 | 4 | |
| AC-6 published vs draft labelled | 0 | 2 | |
| matrix row / route | 4 | 1 | |

### US-14 Update venue
Unit: `venues-update.service.spec.ts` and matrix rows. e2e: `test/venues-update.e2e-spec.ts`.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 any detail editable | 6 | 5 | |
| AC-2 persisted, catalogue reflects it | 2 | 2 | |
| AC-3 warning when bookings may need review | 11 | 8 | Includes finished and rejected bookings ignored |
| AC-4 required field cannot be blanked | 6 | 6 | 1 weak test |
| perm / matrix row | 1 / 2 | 0 | |

### US-15 Browse venue catalogue
Unit: `venues-browse.service.spec.ts`, 2 US-15 tests in `venues-search.service.spec.ts`, and matrix rows. e2e: `test/venues-browse.e2e-spec.ts` and 2 US-15 tests in `venues-search.e2e-spec.ts`.

| AC | Unit | e2e | Notes |
|---|---:|---:|---|
| AC-1 list with key details | 4 | 8 | e2e includes the US-13 draft rule |
| AC-2 full detail on one venue | 0 | 2 | |
| AC-3 sort or look up by name | 11 | 11 | |
| AC-4 no stale data | 2 | 4 | Includes `Cache-Control: no-store` |
| matrix row | 3 | 0 | |

## Gaps

ACs with no test, or with only weak or indirect coverage:

| # | Story / AC | Gap | Evidence |
|---|---|---|---|
| G1 | US-08 AC-2, US-09 AC-1, US-03 AC-3 | A whitespace-only reason, question or required text (`'   '`) is **accepted**. `@IsNotEmpty` only rejects `''`. | `test/events-decision.e2e-spec.ts:169` is titled "…empty or whitespace-only" but sends `{ reason: '' }`. The fix and its tests are parked on `sprint3-raye-BACKUP`. |
| G2 | US-07 AC-3, US-08 AC-3, US-11 | A simultaneous approve and reject can both return 200, giving an illegal APPROVED → REJECTED transition. No concurrency test exists. | Reproduced in 9 of 10 runs: `setStatus()` checks against a stale read. |
| G3 | US-11 (all ACs) | No integration test owned by the story. Coverage is unit-level plus indirect e2e checks in US-05/07/08/09. | No `test/*status*` lifecycle spec. |
| G4 | US-03 AC-3 | Missing boundary cases: end = start, attendance = 1, a start "just" in the past. Only clearly invalid values are tested. | Searched `events-submit.e2e-spec.ts` and `events.service.spec.ts`. |
| G5 | US-01 AC-3, US-02 AC-8 | "Redirected to login" is tested only as a 401 with `loginUrl`. The frontend redirect is untested, and `UnauthorizedFilter` has no unit spec. | Asserted only at `access-control.e2e-spec.ts:374`; `auth.e2e` doesn't register the filter. |
| G6 | US-02 AC-4, US-04 AC-3 | "Visible menus" and "visually distinguishable draft" are UI ACs, tested only through API data. | No Sprint 1 frontend tests on this branch. |
| G7 | US-10 AC-1/2 | The statuses where assignment is allowed are only checked with `resolves.toBeDefined()`. | `events-assign.service.spec.ts:209` |
| G8 | US-15 AC-2 | No unit test of a successful single-venue read (e2e only). | `venues.service.spec.ts:276` tests not-found only |

## Showcase tests

Two to four per story, chosen to show the happy path, a failure or permission case, and a boundary or conflict case.

| Story | Test (file:line) | Kind | Why |
|---|---|---|---|
| US-01 | `test/auth.e2e-spec.ts:57` returns 200 with an access token | Happy | Real login over HTTP against the DB |
| | `test/auth.e2e-spec.ts:103` byte-identical bodies for both failures | Failure | Proves the error reveals neither field (AC-2) |
| | `test/auth.e2e-spec.ts:204` locks on the 15th… helpline | Boundary | 14 failures stay open, the 15th locks (AC-5) |
| | `test/auth.e2e-spec.ts:150` 204 and token unusable afterwards | Conflict | Logout actually revokes the token (AC-4) |
| US-02 | `test/access-control.e2e-spec.ts:118` denies an undeclared route, for every role | Failure | Default-deny across all roles (AC-1) |
| | `test/access-control.e2e-spec.ts:166` rejects a direct URL call for an ungranted role | Permission | Server-side, not UI-only (AC-3) |
| | `test/access-control.e2e-spec.ts:319` omits internal planning fields | Happy | Attendee projection (AC-7) |
| | `test/access-control.e2e-spec.ts:245` matches what the server actually enforces | Conflict | Advertised permissions equal enforced ones (AC-4) |
| US-03 | `test/events-submit.e2e-spec.ts:71` returns 201 with status SUBMITTED | Happy | AC-1 end to end |
| | `test/events-submit.e2e-spec.ts:237` flags EVERY offending field at once | Failure | AC-3: every field flagged in one response |
| | `test/events-submit.e2e-spec.ts:145` visible to a Coordinator for review | Happy | AC-2 cross-role visibility |
| | `test/events-submit.e2e-spec.ts:96` ignores a client-supplied organiserId or status | Conflict | A client cannot forge status or ownership |
| US-04 | `test/events-draft.e2e-spec.ts:79` accepts a draft with required fields still empty | Happy | AC-1 |
| | `test/events-draft.e2e-spec.ts:278` blocks submitting an incomplete draft… | Failure | AC-4 with per-field errors |
| | `test/events-draft.e2e-spec.ts:346` refuses to edit it (submitted) | Conflict | AC-5: 409 on a frozen request |
| | `test/events-draft.e2e-spec.ts:197` marks DRAFT vs SUBMITTED | Happy | AC-3 at API level |
| US-05 | `test/events-status-view.e2e-spec.ts:94` reports every status in the lifecycle | Happy | AC-1, all statuses |
| | `test/events-status-view.e2e-spec.ts:135` includes decisionReason on a rejected request | Happy | AC-2 |
| | `test/events-status-view.e2e-spec.ts:304` does not leak another Organiser's rejection reason | Permission | AC-5 |
| | `test/events-status-view.e2e-spec.ts:244` reflects a later submitted → under review change | Conflict | AC-4: latest state after a transition |
| US-06 | `test/events-layout.e2e-spec.ts:81` rejects a layout outside the list… | Failure | AC-1, predefined list enforced |
| | `test/events-layout.e2e-spec.ts:247` survives the draft being submitted | Happy | AC-4 persistence |
| | `test/events-layout.e2e-spec.ts:304` submits with neither recorded | Boundary | AC-5: preferences are not blockers |
| | `test/events-layout.e2e-spec.ts:389` still hides them from an Attendee | Permission | Internal planning data protected |
| US-07 | `test/events-review.e2e-spec.ts:146` moves a submitted request to APPROVED | Happy | AC-3 |
| | `test/events-review.e2e-spec.ts:254` refuses a Coordinator assigned to a different event | Permission | Only the assigned Coordinator may approve |
| | `test/events-review.e2e-spec.ts:192` refuses to approve a DRAFT | Conflict | Illegal transition refused |
| | `test/events-review.e2e-spec.ts:215` approving twice leaves it APPROVED | Boundary | Idempotency |
| US-08 | `test/events-decision.e2e-spec.ts:76` reject and return are different endpoints… | Happy | AC-1, distinct outcomes |
| | `test/events-decision.e2e-spec.ts:187` nothing is written when the reason is missing | Failure | AC-2 atomicity |
| | `test/events-decision.e2e-spec.ts:129` a rejected request cannot then be returned | Conflict | Decision finality |
| | `test/events-decision.e2e-spec.ts:344` returns, amended, resubmitted, approved | Happy | Full AC-3/AC-4 round trip |
| US-09 | `test/events-clarification.e2e-spec.ts:161` is visible to the Organiser | Happy | AC-3 for both parties |
| | `test/events-clarification.e2e-spec.ts:208` notifies the Coordinator when the Organiser responds | Happy | AC-4 |
| | `test/events-clarification.e2e-spec.ts:326` timestamps every entry, in order | Boundary | AC-5 audit trail ordering |
| | `test/events-clarification.e2e-spec.ts:248` refuses a response when nothing was asked | Conflict | No answer without a question |
| US-10 | `test/events-assign.e2e-spec.ts:76` assigns a Coordinator to a submitted event | Happy | AC-1 |
| | `test/events-assign.e2e-spec.ts:232` removes the previous Coordinator's ownership | Conflict | AC-2 reassignment transfers access |
| | `test/events-assign.e2e-spec.ts:148` rejects an assignee who is not a Coordinator | Failure | Invalid target refused |
| | `test/events-assign.e2e-spec.ts:330` shows the Coordinator to an Attendee too | Permission | AC-3 "any authorised user" |
| US-11 | `src/events/event-status.machine.spec.ts:78` forbids skipping review | Conflict | Transition table refuses illegal jumps |
| | `src/events/event-status.machine.spec.ts:170` reports a rejection with its reason | Happy | AC-2 |
| | `src/events/events-status-audit.spec.ts:52` writes EventRequest.status in exactly one place | Boundary | Guarantees AC-3: every change goes through setStatus |
| | `test/events-status-view.e2e-spec.ts:244` (cross-story) | Happy | Only HTTP-level proof of AC-3 |
| US-12 | `test/events-coordinator-view.e2e-spec.ts:84` returns name, purpose, description, dates and attendance | Happy | AC-1 |
| | `test/events-coordinator-view.e2e-spec.ts:168` shows equipment needs alongside the core details | Happy | AC-2 |
| | `test/events-coordinator-view.e2e-spec.ts:214` denies a Coordinator once the event belongs to a peer | Permission | AC-3 |
| | `test/events-coordinator-view.e2e-spec.ts:258` does not leak the organiser's contact details on denial | Failure | AC-3: no data at all |
| US-13 | `test/venues.e2e-spec.ts:166` blocks an empty draft and names each missing field | Failure | AC-3 |
| | `test/venues.e2e-spec.ts:210` hides a draft from a Coordinator browsing the catalogue | Permission | AC-4 |
| | `test/venues.e2e-spec.ts:276` appears to a Coordinator on the next load | Happy | AC-5 |
| | `test/venues.e2e-spec.ts:346` labels each entry with its status | Happy | AC-6 |
| US-14 | `test/venues-update.e2e-spec.ts:179` warns when capacity is reduced on a venue with a live booking | Happy | AC-3 |
| | `test/venues-update.e2e-spec.ts:240` ignores a booking that has already finished | Boundary | AC-3 "active or upcoming" only |
| | `test/venues-update.e2e-spec.ts:299` treats an empty string as blank | Failure | AC-4 |
| | `test/venues-update.e2e-spec.ts:155` visible to a Coordinator on next load | Happy | AC-2 |
| US-15 | `test/venues-browse.e2e-spec.ts:92` name, location and capacity at a glance | Happy | AC-1 |
| | `test/venues-browse.e2e-spec.ts:120` facilities, accessibility, layouts and hours | Happy | AC-2 |
| | `test/venues-browse.e2e-spec.ts:199` never widens visibility through a search | Permission | Search cannot reveal drafts |
| | `test/venues-browse.e2e-spec.ts:255` reflects an edit immediately | Conflict | AC-4 no stale data |

## Action items from the triage (Sprint 1 only)

Nothing has been changed. All files listed here were added by Lin Hui (`git log --diff-filter=A`).

| # | Kind | File:line | Story / AC | Suggested action |
|---|---|---|---|---|
| N1 | Strict noise | `src/events/event-status.machine.spec.ts:27` "has an entry for every status in the enum" | US-11 AC-1 | Delete: `Record<EventStatus, …>` already enforces it at compile time, and line 33 covers the AC |
| N2 | Strict noise (infra) | `test/app.e2e-spec.ts:31` "boots" (`expect(app).toBeDefined()`) | — | Delete: every e2e file already boots the app |
| W1 | Weak assertion | `src/common/access/access-control.service.spec.ts:70` "finds an event they own" | US-02 AC-5 | Assert the returned event or the query it ran |
| W2 | Weak assertion ×5 | `src/events/events-assign.service.spec.ts:209` "allows assignment while %s" | US-10 AC-1/2 | Assert `coordinatorId` was written |
| W3 | Weak assertion | `src/venues/venues-update.service.spec.ts:252` "allows clearing on a draft" | US-14 AC-4 | Assert the update payload |
| M1 | Misleading test | `test/events-decision.e2e-spec.ts:169` "…empty or whitespace-only" | US-08 AC-2 | Add the `'   '` case; it will fail until the DTO fix (G1) lands |
| T1 | Oversized table (12 rows) | `src/events/events-status-view.service.spec.ts:77` "reports %s" | US-05 AC-1 | Keep 3 representative statuses, or keep the table as an exhaustiveness check |
| T2 | Oversized table (12 rows) | `src/events/events-review.service.spec.ts:85` "reports %s" | US-07 AC-1 | Same as T1 |
| — | Smoke test (keep) | `src/app.module.spec.ts:27` "compiles the dependency graph" | — | Keep: it catches dependency-wiring errors across all modules |

No zero-assertion tests, snapshot tests, or tests that mock the unit under test were found in the committed Sprint 1 files.
