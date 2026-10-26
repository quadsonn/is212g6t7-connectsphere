# Sprint 3 coverage check (Story 38 to 42)

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
