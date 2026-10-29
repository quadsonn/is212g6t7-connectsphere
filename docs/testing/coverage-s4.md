# Sprint 4 coverage check (Story 58 to 67)

Story 58 to 62: measured on 2026-10-29 on `Sprint4-RAYE`, and still 100% (312/312 statements, 109/109 branches) after the gap #5 fix. Unit: `npx jest --coverage` (1946 tests). Integration: the full suite, all 69 files (1437 tests), on `localhost` / `connectsphere_test`. Combined = covered by either suite, merged per statement and branch (same method as [coverage-s3.md](coverage-s3.md)). Rows with a method name count only that method.

| | Statements | Branches |
|---|---|---|
| Before the new tests | 94.5% (292/309) | 80.2% (85/106) |
| **Combined** | **100% (309/309)** | **100% (106/106)** |

| Story | File (or method) | Statements | Branches |
|---|---|---|---|
| 58 | events/events.service.ts (`respondToClarification`) | 100.0% | 100.0% |
| 58 | events/dto/respond-clarification.dto.ts | 100.0% | — |
| 59 | registrations/registration-notifications.service.ts | 100.0% | 100.0% |
| 59 | registrations/registration-notifications.ts | 100.0% | 100.0% |
| 59 | registrations/registration-notifications.scheduler.ts | 100.0% | — |
| 60 | equipment/equipment-status-notifier.ts | 100.0% | 100.0% |
| 61 | events/events-technical-support.service.ts | 100.0% | 100.0% |
| 61 | events/technical-support.rules.ts | 100.0% | 100.0% |
| 61 | equipment/technical-support-assignments.service.ts | 100.0% | — |
| 61 | equipment/technical-support-assignments.controller.ts | 100.0% | — |
| 61 | events/dto/assign-technical-support.dto.ts | 100.0% | — |
| 62 | safety/safety.service.ts (`resubmit`) | 100.0% | 100.0% |
| 62 | safety/safety.service.ts (`hasChangesSince`) | 100.0% | — |
| 62 | safety/dto/resubmit-safety.dto.ts | 100.0% | 100.0% |

**Nothing is left uncovered, so nothing needs a "not possible" reason.**

**How the last paths are reached:**

| Path | Test |
|---|---|
| Re-assigning the current member; an unknown member; a cancelled event; removing with nobody assigned | `us61-technical-support-assignment` (integration) |
| A Coordinator who can see the event but is not assigned; an event with no dates; a clash with an unnamed or undated event | `events/events-technical-support.service.spec.ts` (new) |
| Nameless events, "1 place" and "full" wording; a notice already claimed once the row is locked | `registrations/registration-notifications.service.spec.ts` |
| The every-minute tick, including one sweep failing | `registrations/registration-notifications.scheduler.spec.ts` (new) |
| An item that has gone; an actor whose name cannot be read | `equipment/equipment-status-notifier.spec.ts` |
| A response on a request with no name | `events/events-clarification.service.spec.ts` |

**Gap #5** (the "opens" notice sent before the opening time) was fixed on 2026-10-29; its regression test is TC-S4-65.

## Story 63 to 67

Measured on 2026-10-29. Unit: `npx jest --coverage` (1954 tests). Integration: the full suite, all 69 files (1444 tests), on `localhost` / `connectsphere_test`. Combined, same method as above.

| | Statements | Branches |
|---|---|---|
| Before the new tests | 97.8% (485/496) | 87.3% (137/157) |
| After the integration and notifier tests | 99.6% (494/496) | 98.1% (154/157) |
| **Combined, with the backstop unit tests** | **100% (496/496)** | **100% (157/157)** |

| Story | File | Statements | Branches |
|---|---|---|---|
| 63 | events/events-request-notifier.service.ts | 100.0% | 100.0% |
| 64 | notifications/safety-check-notifier.service.ts | 100.0% | 100.0% |
| 64 | users/user-ids-with-role.ts | 100.0% | — |
| 65 | events/events-cancellation.service.ts | 100.0% | 100.0% |
| 65 | events/events-assignment.service.ts | 100.0% | 100.0% |
| 66 | equipment/technical-support-notifier.ts | 100.0% | 100.0% |
| 67 | equipment/equipment-notifier.ts | 100.0% | 100.0% |
| 67 | equipment/equipment-substitutions.service.ts | 100.0% | 100.0% |
| 67 | equipment/equipment-substitution.ts | 100.0% | 100.0% |
| 67 | equipment/equipment-substitutions.controller.ts | 100.0% | — |
| 67 | equipment/dto/substitution-choice.dto.ts | 100.0% | — |

**Nothing is left uncovered.** Three backstops in `equipment/equipment-substitutions.service.ts` cannot be reached through the running app, because a check or constraint before them already guarantees the outcome. They are covered by unit tests with a mocked database (`equipment/equipment-substitutions.service.spec.ts`), so each still behaves as meant if its guarantee is ever lost:

| Line | Backstop | Why the app never reaches it |
|---|---|---|
| 361 | Accepting a suggestion whose alternative is missing inside the transaction | `accept` refuses a suggestion with no alternative before the transaction (`acceptError`), and a suggestion's alternative is never changed after it is recorded. |
| 585–586 | "Alternative not found" while recording a suggestion | Each proposed item is locked first (`lock`), and the lock already answers 404 for an item that does not exist (tested in integration). |
| 728 | The Coordinator's name missing in the "decided" notice | The deciding Coordinator is assigned to the event, and a user referenced by an event cannot be deleted (foreign key `Restrict`). |

**How the rest are reached:**

| Path | Test |
|---|---|
| An unknown or released reservation, both choices, an unknown item (404 from the lock); an item another event holds too much of; same-type alternatives by id; the reservation released or the original back in service before acceptance | `equipment-substitutions` (integration) |
| Cancelling tells the Coordinator their equipment was released | `events-cancel-confirmation` (integration) |
| Every equipment notice for an unnamed event; the Leads fall-back | `equipment/equipment-notifier.spec.ts` |
| A Safety Officer alert for an event with no date; a failure that is not an Error | `notifications/safety-check-notifier.service.spec.ts` |
| A change notice for an unnamed event | `events/events-request-notifier.service.spec.ts` |
| A requirements change for an event that has gone | `equipment/technical-support-notifier.spec.ts` |

