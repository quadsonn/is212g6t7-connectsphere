# Sprint 3 coverage check (Story 38 to 57)

Measured on 2026-10-27 on `Sprint4-RAYE`, after the Story 42 step; **updated** after the two TEST-gap tests were added. Unit: `npx jest --coverage` (1873 tests). Integration: the six Sprint 3 files, 104 tests, on `localhost` / `connectsphere_test` (`us38-attendee-change-notifications`, `us39-request-outcome-notifications`, `us40-venue-notifications`, `notifications`, `bookings-suggestions`, `events-confirm`). Combined = covered by either suite, merged per statement and branch (same method as [coverage-s1.md](coverage-s1.md)).

## Summary

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

## Story 43 to 47

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

## Story 48 to 57

Measured on 2026-10-27 after the Story 48–57 step. Unit: `npx jest --coverage` (1875 tests). Integration: `events-change-request-check`, `venue-buffers`, `venues-buffers`, `booking-review-flags`, `bookings-venue-unavailable`, `bookings-multi-venue`, `us54-venue-holds`, `events-assignment`, `safety-check` (262 tests) on `localhost` / `connectsphere_test`. Combined, same method as above. Files are the ones these stories added; shared files (`bookings.service.ts`, `venues.service.ts`) are covered by the same runs but not listed.

| | Statements | Branches |
|---|---|---|
| Before the TEST-gap tests | 96.9% (751/775) | 82.3% (204/248) |
| **Combined** | **98.5% (763/775)** | **85.1% (211/248)** |

| Story | File | Statements | Branches |
|---|---|---|---|
| 48 | events/change-arrangement-check.service.ts | 98.4% | 91.7% |
| 48 | events/change-arrangement-check.ts | 100.0% | 86.4% |
| 48 | bookings/booking-reschedule.ts | 100.0% | 100.0% |
| 49/50 | bookings/booking-overlap.ts | 89.5% | 81.8% |
| 51 | bookings/booking-review.service.ts | 100.0% | 77.8% |
| 51 | bookings/buffer-clashes.ts | 100.0% | 87.5% |
| 52 | bookings/venue-unavailability.service.ts | 100.0% | 100.0% |
| 52 | bookings/venue-unavailability.ts | 100.0% | 100.0% |
| 53 | bookings/venue-arrangement.ts | 100.0% | 100.0% |
| 54 | bookings/holds.service.ts | 98.9% | 92.9% |
| 54 | bookings/holds.controller.ts | 100.0% | — |
| 54 | bookings/hold-expiry.ts | 100.0% | 66.7% |
| 54 | bookings/hold-expiry.scheduler.ts | 100.0% | 100.0% |
| 54 | bookings/dto/hold.dto.ts | 100.0% | — |
| 55/56 | events/events-assignment.service.ts | 98.9% | 80.0% |
| 55/56 | events/events-assignment.controller.ts | 100.0% | 100.0% |
| 55/56 | events/dto/assign-coordinator.dto.ts | 100.0% | — |
| 57 | safety/safety.service.ts | 97.1% | 86.4% |
| 57 | safety/safety-readiness.service.ts | 91.3% | 66.7% |
| 57 | safety/safety-readiness.rules.ts | 100.0% | 100.0% |
| 57 | safety/safety.controller.ts | 100.0% | — |
| 57 | safety/dto/safety-decision.dto.ts | 100.0% | 50.0% |
| 57 | safety/dto/resubmit-safety.dto.ts | 100.0% | 100.0% |

**TEST (now covered):** a draft venue or an unknown event cannot be held (`holds.service.ts:92, 97`); the every-minute hold tick, including one job failing (`hold-expiry.scheduler.ts:37–44`, new unit spec); a decision on, or the history of, an unknown event (`safety.service.ts:342, 417`); resubmitting an event cancelled while feedback waited (`safety.service.ts:505`); an event leaving the Safety queue once its equipment is released (`safety-readiness.service.ts:158`). **DEFERRED:** none. **EXCLUDE** (all of the rest):

| File:line | What isn't covered | Reason |
|---|---|---|
| `events/change-arrangement-check.service.ts:122` | An event with no proposed start or end | Only submitted events get change requests, and submission requires both. |
| `bookings/booking-overlap.ts:17, 128` | `overlapping()` and `committedOverlapping()` | No caller in `src`: unused helpers. Flagged for the team to remove or use. |
| `safety/safety-readiness.service.ts:101, 107` | `isHeld()` | No caller in `src`: the queue lists only events awaiting a check, and only Confirm or a resubmit puts one there, so nothing needs to ask. Flagged as above. |
| `bookings/holds.service.ts:263` | A past expiry inside the service | `HoldExpiryDto` (`@MinDate`) refuses it first (tested: 400). |
| `events/events-assignment.service.ts:387`, `safety/safety-readiness.service.ts:131` | Re-throwing an unexpected database error | Only a database failure reaches it. |
| `safety/safety.service.ts:358` | Deciding while the arrangements have stopped being ready | The arrangements listener takes the event out of the queue first (tested); this is the race backstop. |
| `safety/safety.service.ts:476` | The event vanishing between the access check and the lock | Events are never deleted. |
| `safety/safety.service.ts:585` | Notifying when the event has no Coordinator | An event awaiting a safety check always has one. |
| Branches | Name and venue fallbacks ("Untitled event", "an unnamed venue"), default parameters (`now`, `db`, `scope`), `?? null` on optional DTO fields, and the guards above | Same reasons: values that are always present, or callers that always pass them. |
