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

> **Superseded for Story 67 on 2026-10-30.** The four substitution files and their tests were removed when `sprint4-main` retired the substitution flow (PR #30). Story 67 is now measured with Story 45; see "Story 45, 60 and 67 after the Sprint 4 rebuild" below.

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

## Story 45, 60 and 67 after the Sprint 4 rebuild

Measured on 2026-10-30, after merging `sprint4-main` (Story 45 by quantity; substitutions retired). Unit: `npx jest --coverage` (1959 tests). Integration: the full suite, all 71 files (1479 tests), on `localhost` / `connectsphere_test`. Combined, same method as above.

| | Statements | Branches |
|---|---|---|
| After the merge, before the new tests | 98.9% (645/652) | 90.7% (195/215) |
| **Combined, with the new integration and backstop unit tests** | **100% (652/652)** | **100% (215/215)** |

| Story | File | Statements | Branches |
|---|---|---|---|
| 45 | equipment/equipment-status.ts | 100.0% | 100.0% |
| 45 | equipment/equipment-availability.ts | 100.0% | 100.0% |
| 45 | equipment/equipment-shortage.ts | 100.0% | 100.0% |
| 45 | equipment/equipment-shortage.service.ts | 100.0% | 100.0% |
| 45, 67 | events/equipment-shortage-actions.service.ts | 100.0% | 100.0% |
| 45 | events/equipment-shortage.controller.ts | 100.0% | — |
| 45 | events/dto/equipment-shortage.dto.ts | 100.0% | 100.0% |
| 45 | equipment/dto/change-equipment-status.dto.ts | 100.0% | 100.0% |
| 45 | equipment/equipment.controller.ts | 100.0% | — |
| 45 | equipment/equipment.service.ts | 100.0% | 100.0% |
| 45 | equipment/equipment-reservations.service.ts | 100.0% | 100.0% |
| 60 | equipment/equipment-status-notifier.ts | 100.0% | 100.0% |
| 67 | equipment/equipment-notifier.ts | 100.0% | 100.0% |

**New tests that closed the gaps (reachable through the app):**

| Path | Test |
|---|---|
| A reason that is not text (both DTOs) | `equipment-status::400s for a reason that is not text, changing nothing`; `equipment-shortage::a reason that is not text is refused` |
| Sending more units to maintenance than are damaged | `equipment-status::refuses sending more units to maintenance than are damaged, with a clear message` |
| An unknown item's breakdown; an unknown event's reservations; an unknown reservation's alternatives (404) | `equipment-status`, `equipment-shortage` |
| An affected event with no Coordinator: the Leads are told (seeded directly, `tc-s4-109-setup.sql`) | `equipment-status::an event with no Coordinator yet — the Coordinator Leads are told` |
| Other events' reservations of an alternative item | `equipment-shortage::counts what other events hold of an item, offering it only up to its free units` |
| Suggesting more units than are reserved | `equipment-shortage::never more units than the reservation holds` |
| Accepting after the event was cancelled | `equipment-shortage::becomes invalid if the event is cancelled before the Coordinator decides` |

**Backstops the app cannot reach**, covered by unit tests with a mocked database so each still behaves as meant if its guarantee is ever lost:

| Code | Backstop | Why the app never reaches it | Test |
|---|---|---|---|
| `equipment-shortage-actions.service.ts` (reduce, release, noAlternative, suggest, accept, decline) | `name ?? 'an event'` in each notice | The database requires a name on every event that is not a draft (`EventRequest_complete_unless_draft`), and suggestions are only for confirmed events. | `events/equipment-shortage-actions.service.spec.ts` |
| `equipment-shortage-actions.service.ts:392` | Accepting when the reservation holds fewer units than suggested | Reducing a reservation closes every open suggestion for more than it keeps (`invalidateSuggestions`). | same |
| `equipment-shortage-actions.service.ts:539` | The alternative item missing inside the transaction | A suggestion's foreign key keeps its item. | same |
| `equipment.service.ts:288` | Two changes recorded at the same instant (ID tie-break) | Each request records its own time. | `equipment/equipment-condition.service.spec.ts` |
| `equipment.service.ts:314` | No proposed move passed at all | The controller always passes the query object. | same |
| `equipment-reservations.service.ts:476` | Committing for an event with no date and time (Sprint 2 code) | The completeness CHECK requires both dates on every non-draft event. | `equipment/equipment-reservations.service.spec.ts` |

