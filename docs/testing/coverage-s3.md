# Sprint 3 coverage check (Story 38 to 57)

**Current figures:** Story 38–47 and Story 48–57 are both at 100% of statements; branches are 100% for 48–57 and 99.6% for 38–47 (one branch cannot run, stated below). The two earlier Story 38–42 and 43–47 sections are kept as history.

Measured on 2026-10-27 on `Sprint4-RAYE`, after the Story 42 step; **updated** after the two TEST-gap tests were added. Unit: `npx jest --coverage` (1873 tests). Integration: the six Sprint 3 files, 104 tests, on `localhost` / `connectsphere_test` (`us38-attendee-change-notifications`, `us39-request-outcome-notifications`, `us40-venue-notifications`, `notifications`, `bookings-suggestions`, `events-confirm`). Combined = covered by either suite, merged per statement and branch (same method as [coverage-s1.md](coverage-s1.md)).

## Summary (Story 38 to 42, first measurement — superseded by "Story 38 to 47 at 100%" below)

| | Statements | Branches |
|---|---|---|
| Unit | 67.3% | 58.6% |
| Integration | 97.1% | 71.6% |
| **Combined** | **98.6% (341/346)** | **82.1% (133/162)** |

Before the two TEST-gap tests: combined 97.7% (338/346) and 80.2% (130/162).

| Classification | Statements | Branches |
|---|---|---|
| TEST | 0 | 0 |
| DEFERRED | 2 | 7 |
| EXCLUDE | 3 | 22 |

### Per file (combined)

| Story | File | Statements | Branches |
|---|---|---|---|
| 38 | notifications/attendee-change-notifier.service.ts | 100% | 66.7% |
| 38 | notifications/event-schedule-change.ts | 100% | 86.7% |
| 39 | events/events.service.ts (`notifyOrganiserOfDecision`) | 100% | 100% |
| 40 | bookings/venue-activity-notifier.ts | 100% | 83.3% |
| 40 | notifications/notifications-inbox.service.ts | 100% | 92.3% |
| 40 | notifications/notifications.controller.ts | 100% | — |
| 40 | notifications/notification-view.ts | 92.0% | 88.0% |
| 40 | notifications/notifications.service.ts | 94.4% | 80.0% |
| 41 | bookings/booking-suggestions.service.ts | 97.4% | 75.0% |
| 41 | bookings/booking-suggestions.ts | 100% | 87.5% |
| 41 | bookings/booking-alternatives.ts | 100% | 67.9% |
| 42 | events/event-confirmation.service.ts | 98.3% | 64.3% |
| 42 | events/confirmation-readiness.rules.ts | 100% | 95.5% |

## Uncovered lines

### TEST: worth a test

None left. Both gaps are now covered:

| File:line | Now covered by | AC |
|---|---|---|
| `bookings/booking-suggestions.service.ts:139–145` | `bookings-suggestions::refuses to accept the suggestion on %s (409), and creates nothing` (`tc-s3-68c-setup.sql`) | Story 41 AC-6, TC-S3-68 |
| `notifications/notifications-inbox.service.ts:75` | `us40-venue-notifications::US-40: refuses another user's notification as the paging cursor (404)` | Story 40 AC-5, TC-S3-61 |

### DEFERRED: tested with another story

| File:line | What isn't covered | Story |
|---|---|---|
| `bookings/booking-suggestions.service.ts:160` | Accepting a suggestion on a booking that needs a replacement makes it a replacement request | Story 52 (`bookings-venue-unavailable`) |
| `events/event-confirmation.service.ts:147–148` | Confirm refused while safety feedback awaits an answer | Story 57, Week 7 Change 6 (`safety-check`) |
| `events/confirmation-readiness.rules.ts:65` | A booking on tentative hold reads "on hold" | Story 54 (`us54-venue-holds`) |
| `notifications/notification-view.ts:51–52`, `notifications/notifications.service.ts:56` | Technical Support's link to an equipment item | Story 45 (equipment status) |

### EXCLUDE: not worth testing

| File:line | What isn't covered | Reason |
|---|---|---|
| `notifications/attendee-change-notifier.service.ts:68` | Logging a thrown value that is not an `Error` | Defensive logging only. |
| `notifications/event-schedule-change.ts:46–47` | A `Date` value, or one that cannot be parsed | Change history stores ISO strings; an unparsable value cannot be written. |
| `bookings/venue-activity-notifier.ts:70` | "not set" for a booking with no previous attendance | Every booking request requires attendance (DTO); only legacy rows lack it. |
| `notifications/notifications-inbox.service.ts:67` | `list()` called with no page argument | The controller always passes the query object. |
| `notifications/notification-view.ts:56, 76–78, 95` | A role with no event page; "Reason:" followed by nothing | Every role has a case; no sender writes an empty reason. |
| `notifications/notifications.service.ts:70, 78` | `notifyMany([])`; a batch without a booking | Every caller checks for recipients first. |
| `bookings/booking-suggestions.service.ts:169–170` | Two simultaneous accepts of one suggestion | One conditional update guards it; the sequential double accept is tested (TC-S3-68). |
| `bookings/booking-suggestions.ts:71`, `bookings/booking-alternatives.ts:105, 131, 138–141` | Unnamed venue, unknown capacity, equal names in the ranking sort | A published venue must have a name and capacity (CHECK `Venue_complete_unless_draft`); ties fall back to the ID. |
| `events/event-confirmation.service.ts:92, 171` | Unnamed venue or event in messages | Published venues and events past review always have names. |

## Proposed tests

None: both proposed tests are written and pass. Everything still uncovered is DEFERRED or EXCLUDE.

---

## Story 43 to 47 (first measurement — superseded by "Story 38 to 47 at 100%" below)

Measured on 2026-10-27 after the Story 43–47 step. Unit: `npx jest --coverage` (1873 tests). Integration: `us43-cancel-event`, `us44-release-on-cancel`, `equipment-status`, `registrations-period-capacity`, `events-reject-unfulfillable` (115 tests) on `localhost` / `connectsphere_test`. Combined, same method as above.

| | Statements | Branches |
|---|---|---|
| **Combined** | **99.5% (213/214)** | **84.4% (65/77)** |

| Story | File (or method) | Statements | Branches |
|---|---|---|---|
| 43 | events/events-cancellation.service.ts | 100% | 83.3% |
| 43 | events/event-cancellation.rules.ts | 100% | 100% |
| 43 | events/dto/cancel-event.dto.ts | 100% | 50.0% |
| 44 | bookings/bookings.service.ts (`releaseForCancelledEvent`) | 100% | 50.0% |
| 45 | equipment/equipment-status.ts | 100% | 100% |
| 45 | equipment/equipment.service.ts (`changeStatus`) | 100% | 87.5% |
| 45 | equipment/dto/change-equipment-status.dto.ts | 100% | 100% |
| 46 | registrations/registration-rules.ts | 100% | 87.5% |
| 46 | registrations/registrations.service.ts (`register`) | 100% | 90.0% |
| 47 | events/events-unfulfillable.service.ts | 97.2% | 50.0% |

**TEST:** none. **DEFERRED:** none. **EXCLUDE** (all of the rest):

| File:line | What isn't covered | Reason |
|---|---|---|
| `events/events-cancellation.service.ts:200, 244`, `registrations/registrations.service.ts:234`, `events/events-unfulfillable.service.ts:115` | "An event" / "your event" / "the event" / "Untitled event" name fallbacks | Events past submission always have a name. |
| `events/dto/cancel-event.dto.ts:10` | Trimming a reason that is not a string | `@IsString` refuses it anyway (tested: 400). |
| `bookings/bookings.service.ts:1290` | The default `now` parameter | Every caller passes the time. |
| `equipment/equipment.service.ts:316` | An affected reservation on an event with no Coordinator | Reservations are only made for events in planning, which always have one. |
| `registrations/registration-rules.ts:74, 79, 122, 130` | Windows for an event with no start date; a message with no open or close time | A CONFIRMED event always has a start, so both times always resolve. |
| `events/events-unfulfillable.service.ts:76–77` | 403 for a Coordinator who can see the event but is not assigned | After Change 5 a Coordinator only sees events assigned to them, so access is refused first (404, tested). |

**Story 45 code gaps are not coverage gaps:** the per-unit status, shortage flags, alternative suggestions and reduce/release (TC-S3-88, 90, 91, 95–98) have no code to cover; see the test cases.


## Story 38 to 47 at 100%

Measured on 2026-10-29, after merging `sprint4-main` and `sprint4-marilyn`. Unit: `npx jest --coverage` (1938 tests). Integration: the **full** suite, all 68 files (1426 tests), on `localhost` / `connectsphere_test`, because code in these stories is also exercised by later stories' files (Story 52, the equipment substitutions). Combined, same method as above. Rows with a method name count only that method.

| | Statements | Branches |
|---|---|---|
| Before (this merge, integration files for 38–47 only) | 98.4% (563/572) | 83.3% (205/246) |
| **Combined, with the full suite and the new unit tests** | **100% (572/572)** | **99.6% (245/246)** |

| Story | File (or method) | Statements | Branches |
|---|---|---|---|
| 38 | notifications/attendee-change-notifier.service.ts | 100.0% | 100.0% |
| 38 | notifications/event-schedule-change.ts | 100.0% | 100.0% |
| 39 | events/events.service.ts (`notifyOrganiserOfDecision`) | 100.0% | 100.0% |
| 40 | bookings/venue-activity-notifier.ts | 100.0% | 100.0% |
| 40 | notifications/notifications-inbox.service.ts | 100.0% | 100.0% |
| 40 | notifications/notifications.controller.ts | 100.0% | — |
| 40 | notifications/notification-view.ts | 100.0% | 100.0% |
| 40 | notifications/notifications.service.ts | 100.0% | 100.0% |
| 41 | bookings/booking-suggestions.service.ts | 100.0% | 100.0% |
| 41 | bookings/booking-suggestions.ts | 100.0% | 100.0% |
| 41 | bookings/booking-alternatives.ts | 100.0% | 100.0% |
| 42 | events/event-confirmation.service.ts | 100.0% | 100.0% |
| 42 | events/confirmation-readiness.rules.ts | 100.0% | 95.5% |
| 43 | events/events-cancellation.service.ts | 100.0% | 100.0% |
| 43 | events/event-cancellation.rules.ts | 100.0% | 100.0% |
| 43 | events/dto/cancel-event.dto.ts | 100.0% | 100.0% |
| 44 | bookings/bookings.service.ts (`releaseForCancelledEvent`) | 100.0% | 100.0% |
| 45 | equipment/equipment-status.ts | 100.0% | 100.0% |
| 45 | equipment/equipment.service.ts (`changeStatus`) | 100.0% | 100.0% |
| 45 | equipment/dto/change-equipment-status.dto.ts | 100.0% | 100.0% |
| 46 | registrations/registration-rules.ts | 100.0% | 100.0% |
| 46 | registrations/registrations.service.ts (`register`) | 100.0% | 100.0% |
| 47 | events/events-unfulfillable.service.ts | 100.0% | 100.0% |

**Not possible (1 branch):**

| File:line | Branch | Why it cannot run |
|---|---|---|
| `events/confirmation-readiness.rules.ts:65` | The "not approved (status)" wording for a venue booking | `venueItem()` is private and only ever receives live bookings (pending, approved, or a hold that has not expired); `occupies()` filters everything else out first. The wording is a deliberate safety net for a status added later (see the allowlist comment above `occupies`), so no input can reach it. |

**How the rest are reached.** Fallbacks for missing names, default parameters, race guards and failures that the running app cannot produce are covered by unit tests built with mocks, each tagged with its TC and listed in the test case:

| Path | Unit test |
|---|---|
| A date stored as a Date, or an unreadable value, in the Attendee notice | `notifications/event-schedule-change.spec.ts` |
| A failure that is not an Error object, swallowed | `notifications/attendee-change-notifier.service.spec.ts` |
| Attendance changed from nothing recorded | `bookings/venue-activity-notifier.spec.ts` (new) |
| The inbox with no page given | `notifications/notifications-inbox.service.spec.ts` (new) |
| Technical Support's equipment link; an unknown role; an empty reason | `notifications/notification-view.spec.ts` |
| The equipment item recorded only when named; an empty batch; a batch notice with no event | `notifications/notifications.service.spec.ts` |
| An unnamed venue that is not free; two accepts racing for one suggestion | `bookings/booking-suggestions.spec.ts` (new) |
| Unnamed venues and a request with no attendance, ranked | `bookings/booking-alternatives.spec.ts` |
| Confirm refused while safety feedback waits, allowed once answered; a nameless venue and event | `events/event-confirmation.service.spec.ts` |
| Cancelling an event with no name | `events/events-cancellation.service.spec.ts` |
| A cancel reason that is not text | `events/dto/cancel-event.dto.spec.ts` (new) |
| Marking an item out of service without the substitutions service, on an event with no Coordinator | `equipment/equipment-change-status.service.spec.ts` (removed 2026-10-30 with the substitutions; the no-Coordinator path is now an integration test, see below) |
| An event with no start date: only the times set on it | `registrations/registration-rules.spec.ts` |
| Registering for an event with no name | `registrations/registrations.service.spec.ts` |
| A Coordinator who is not assigned; an event with no name | `events/events-unfulfillable.service.spec.ts` (new) |

## Story 48 to 57

Measured on 2026-10-29. Unit: `npx jest --coverage` (1916 tests). Integration: `events-change-request-check`, `venue-buffers`, `venues-buffers`, `booking-review-flags`, `bookings-venue-unavailable`, `bookings-multi-venue`, `us54-venue-holds`, `events-assignment`, `safety-check` (262 tests) on `localhost` / `connectsphere_test`. Combined, same method as above. Files are the ones these stories added; shared files (`bookings.service.ts`, `venues.service.ts`) are covered by the same runs but not listed.

| | Statements | Branches |
|---|---|---|
| First measurement (2026-10-27) | 96.9% (751/775) | 82.3% (204/248) |
| After the integration TEST-gap tests | 98.5% (763/775) | 85.1% (211/248) |
| After deleting the three unused helpers (2026-10-28) | 99.0% (761/769) | 86.8% (211/243) |
| **Combined, with the unit tests for the remaining paths** | **100% (769/769)** | **100% (243/243)** |

| Story | File | Statements | Branches |
|---|---|---|---|
| 48 | events/change-arrangement-check.service.ts | 100.0% | 100.0% |
| 48 | events/change-arrangement-check.ts | 100.0% | 100.0% |
| 48 | bookings/booking-reschedule.ts | 100.0% | 100.0% |
| 49/50 | bookings/booking-overlap.ts | 100.0% | 100.0% |
| 51 | bookings/booking-review.service.ts | 100.0% | 100.0% |
| 51 | bookings/buffer-clashes.ts | 100.0% | 100.0% |
| 52 | bookings/venue-unavailability.service.ts | 100.0% | 100.0% |
| 52 | bookings/venue-unavailability.ts | 100.0% | 100.0% |
| 53 | bookings/venue-arrangement.ts | 100.0% | 100.0% |
| 54 | bookings/holds.service.ts | 100.0% | 100.0% |
| 54 | bookings/holds.controller.ts | 100.0% | — |
| 54 | bookings/hold-expiry.ts | 100.0% | 100.0% |
| 54 | bookings/hold-expiry.scheduler.ts | 100.0% | 100.0% |
| 54 | bookings/dto/hold.dto.ts | 100.0% | — |
| 55/56 | events/events-assignment.service.ts | 100.0% | 100.0% |
| 55/56 | events/events-assignment.controller.ts | 100.0% | 100.0% |
| 55/56 | events/dto/assign-coordinator.dto.ts | 100.0% | — |
| 57 | safety/safety.service.ts | 100.0% | 100.0% |
| 57 | safety/safety-readiness.service.ts | 100.0% | 100.0% |
| 57 | safety/safety-readiness.rules.ts | 100.0% | 100.0% |
| 57 | safety/safety.controller.ts | 100.0% | — |
| 57 | safety/dto/safety-decision.dto.ts | 100.0% | 100.0% |
| 57 | safety/dto/resubmit-safety.dto.ts | 100.0% | 100.0% |

**Nothing is left uncovered, so nothing needs an "impossible" reason.**

**How the last paths are reached.** Some paths can't be reached through the running app: a fallback for a missing name, a default parameter, a guard against a race, or a database failure. Those are covered by unit tests that build the situation with mocks, each tagged with its TC:

| Path | Unit test |
|---|---|
| Integration TEST gaps (2026-10-27): a draft venue or unknown event on a hold; a decision on, or history of, an unknown event; resubmitting a cancelled event; equipment released while queued | `us54-venue-holds`, `safety-check` (integration) |
| The every-minute hold tick, including one job failing | `hold-expiry.scheduler.spec.ts` |
| The hold jobs called with no venue or time; `isLive()` with no time | `hold-expiry.spec.ts`, `booking-overlap.spec.ts` |
| A past expiry when the DTO is skipped | `holds.service.spec.ts` |
| An event with no dates; an item whose reservations are all still requested | `change-arrangement-check.service.spec.ts` |
| A nameless hold, venue or event, and a block with no reason, in the check's wording | `change-arrangement-check.spec.ts` |
| A nameless partner in a review flag; the re-check with its defaults; a blank resolve note | `booking-review.service.spec.ts` |
| Same-time clashes sorted by partner, then booking | `buffer-clashes.spec.ts` |
| A lost assignment race to a request that has gone; an unexpected database error; notices for an unnamed event and an unknown actor | `events-assignment.service.spec.ts` |
| Missing capacity or attendance and a block row without its block in the review; arrangements that stop being ready under the lock; a decision with no reason or stage; no Coordinator to notify; an event gone before a resubmit locks it | `safety/safety.service.spec.ts` |
| A nameless venue in the readiness facts; a lost race and an unexpected failure leaving the queue | `safety/safety-readiness.service.spec.ts` |
| A reason that is not text | `safety/safety-decision.dto.spec.ts` |

## Story 45 (reopened) at 100%

Story 45 was rebuilt in Sprint 4 (status by quantity, shortages, alternatives, reduce and release). Its files were measured with Story 60 and 67 on 2026-10-30: **100% statements (652/652), 100% branches (215/215)**. The per-file table, the new tests and the backstops are in [coverage-s4.md](coverage-s4.md), "Story 45, 60 and 67 after the Sprint 4 rebuild". The earlier Story 45 rows above measured the old whole-item code.

