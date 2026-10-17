# Sprint 1 coverage check (done stories)

Scope: US-01, US-03, US-04, US-05, US-06, US-07, US-08, US-09. Measured on 2026-10-17 at commit `dd5f0f8` (branch `sprint3-RAYE`). This was a read-only check: no tests or application code were changed.

## Summary

| | Statements | Branches |
|---|---|---|
| Unit (`npx jest`, 974 tests) | 351/396 (88.6%) | 104/124 (83.9%) |
| Integration (8 converted e2e files, 178 tests) | 369/396 (93.2%) | 98/124 (79.0%) |
| **Combined** (covered by either suite) | **380/396 (96.0%)** | **109/124 (87.9%)** |

The 16 statements and 15 branches that neither suite covers break down as:

| Classification | Statements | Branches | Where |
|---|---|---|---|
| TEST | 7 | 3 | `unauthorized.filter.ts` (US-01 AC-3), `login.dto.ts` (US-01 AC-2) |
| DEFERRED | 0 | 1 | `access-control.service.ts` (US-02) |
| EXCLUDE | 9 | 11 | Configuration fallbacks, an unused decorator overload, unreachable defensive code |

The three bug-fix paths (audit gaps #1, #2 and #3) are all covered; see [Bug-fix paths](#bug-fix-paths).

### Per file

S = statements, B = branches. In `events.service.ts`, `events.controller.ts` and `auth.controller.ts`, only the Sprint 1 methods are counted (see [Scope](#scope)).

| File | Stmts | S unit | S int | **S comb** | Branches | B unit | B int | **B comb** |
|---|---|---|---|---|---|---|---|---|
| auth/auth.service.ts | 53 | 86.8 | 86.8 | **86.8** | 31 | 80.6 | 80.6 | **80.6** |
| auth/auth.controller.ts (login, logout, me) | 7 | 42.9 | 100 | **100** | 0 | — | — | **—** |
| auth/jwt.strategy.ts | 13 | 76.9 | 100 | **100** | 3 | 33.3 | 66.7 | **66.7** |
| auth/dto/login.dto.ts | 6 | 83.3 | 100 | **100** | 2 | 0 | 50.0 | **50.0** |
| common/guards/jwt-auth.guard.ts | 5 | 100 | 100 | **100** | 0 | — | — | **—** |
| common/guards/roles.guard.ts | 26 | 100 | 88.5 | **100** | 5 | 100 | 60.0 | **100** |
| common/decorators/current-user.decorator.ts | 5 | 40.0 | 100 | **100** | 2 | 0 | 50.0 | **50.0** |
| common/decorators/roles.decorator.ts | 5 | 100 | 100 | **100** | 0 | — | — | **—** |
| common/decorators/require-permission.decorator.ts | 5 | 100 | 100 | **100** | 0 | — | — | **—** |
| common/filters/unauthorized.filter.ts | 7 | 0 | 0 | **0** | 2 | 0 | 0 | **0** |
| common/validators/trim.transform.ts | 5 | 100 | 100 | **100** | 2 | 100 | 100 | **100** |
| common/validators/is-after.validator.ts | 13 | 84.6 | 84.6 | **84.6** | 3 | 100 | 100 | **100** |
| common/access/access-control.service.ts | 33 | 97.0 | 87.9 | **100** | 14 | 85.7 | 64.3 | **92.9** |
| events/event-status.machine.ts | 19 | 100 | 100 | **100** | 7 | 100 | 100 | **100** |
| events/dto/create-event-request.dto.ts | 23 | 100 | 100 | **100** | 0 | — | — | **—** |
| events/dto/draft-event-request.dto.ts | 22 | 86.4 | 100 | **100** | 0 | — | — | **—** |
| events/dto/reject-request.dto.ts | 4 | 100 | 100 | **100** | 0 | — | — | **—** |
| events/dto/return-request.dto.ts | 4 | 100 | 100 | **100** | 0 | — | — | **—** |
| events/dto/ask-clarification.dto.ts | 4 | 100 | 100 | **100** | 0 | — | — | **—** |
| events/dto/respond-clarification.dto.ts | 4 | 100 | 100 | **100** | 0 | — | — | **—** |
| events/events.service.ts (Sprint 1 methods) | 107 | 99.1 | 96.3 | **100** | 53 | 92.5 | 84.9 | **94.3** |
| events/events.controller.ts (Sprint 1 handlers) | 26 | 50.0 | 100 | **100** | 0 | — | — | **—** |

A dash means the file has no branches.

## Uncovered lines (combined view)

### TEST: worth a test

| File:line | What isn't covered | Why it matters | AC |
|---|---|---|---|
| `common/filters/unauthorized.filter.ts:19–28` (whole filter) | The 401 response with a `WWW-Authenticate` header and `loginUrl: '/auth/login'` in the body | This is the API half of "redirected to login". It's registered only in `main.ts`, and no integration test app registers it, so every 401 the tests see lacks `loginUrl`. The tests don't match production here. | US-01 AC-3 (TC-S1-57); the same filter serves US-02 AC-8 |
| `auth/dto/login.dto.ts:7` | A non-string `email` (e.g. a number) skips the trim and lowercase | It proves a malformed body gets 400 rather than a crash in the transform | US-01 AC-2 (TC-S1-56) |

### DEFERRED: covered after the merge

| File:line | What isn't covered | Belongs to |
|---|---|---|
| `common/access/access-control.service.ts:135` | The RELATED scope fallback for a role with no related-event filter (`?? { id: { in: [] } }`) | US-02 (and the Change 6 Safety Officer role) |

### EXCLUDE: not worth testing

| File:line | What isn't covered | Reason |
|---|---|---|
| `auth/auth.service.ts:87` (branch) and `186–193` (`tokenLifetimeMs`) | Logout of a token that has no `exp` claim | Unreachable. `JwtModule` always signs with `expiresIn` (default `1h`), so every token we issue has `exp`. |
| `auth/auth.service.ts:198` (2 branches) | Lockout window, attempt limit and lock length overridden from environment variables | It's a configuration hook, not an AC. The AC fixes 15 attempts and 30 minutes, which are the defaults, and those are tested (TC-S1-60 to 62). |
| `auth/jwt.strategy.ts:25` (branch) | `JWT_SECRET` missing, falling back to `''` | A deployment misconfiguration, not behaviour. Every environment sets the secret. |
| `common/decorators/current-user.decorator.ts:13` (branch) | `@CurrentUser('field')`, the overload that takes a key | Unused: no handler in the codebase passes a key. |
| `common/validators/is-after.validator.ts:46–47` (`defaultMessage`) | The default "must be later than" message | Both Sprint 1 DTOs (`create-event-request`, `draft-event-request`) supply their own message, so the default can't appear in these stories. It belongs to later stories' DTOs (bookings, venues, equipment). |
| `events/events.service.ts:408` (branch) | `error.constraints ?? {}` in the submit-readiness check | Defensive only. The candidate DTO is flat, so class-validator always returns `constraints`; only nested validation omits them. |
| `events/events.service.ts:603` and `652` (branches) | `event.name ?? 'your event request'` / `'an event request'` in the clarification notifications | Unreachable in Sprint 1: a question can only be asked on a submitted request, and submission requires a name. The notification wording also belongs to the Sprint 3 notifications story. |

## Bug-fix paths

Each was measured by running the regression test on its own with coverage, and counting hits on the fix line.

| Fix | Regression test | Result |
|---|---|---|
| Gap #1: `@Trim()` on whitespace input (`93316fa`) | `events-decision::%s is blocked when the reason is whitespace-only` (TC-S1-11)<br>`events-clarification::rejects a whitespace-only question` (TC-S1-18)<br>`events-submit::blocks boundary values and flags each field…` (TC-S1-27) | Covered. The transform ran on string input in all three (2, 1 and 4 hits). `trim.transform.ts` is 100% in both suites; the non-string branch is covered by the unit DTO tests. |
| Gap #2: `claimForDecision` 409 for review decisions (`61401ec`) | `events-review::lets exactly one of a simultaneous approve and reject succeed…` (TC-S1-07) | Covered. The 409 throw was hit in 20 of 20 iterations, so every loser was stopped by the lock rather than by an earlier check. |
| Gap #3: `claimForDecision` 409 for clarification responses (`dd5f0f8`) | `events-clarification::accepts exactly one of two simultaneous responses…` (TC-S1-63) | Covered. The 409 throw was hit in 19 of 20 iterations. In the other iteration, the loser arrived after the winner committed and was refused by the existing pre-check, which also returns 409. |

The unit tests don't reach the `claimForDecision` 409 path, because the mocked `$queryRaw` always finds the row. The integration race tests cover it, so the combined view is complete.

## Proposed tests

Not written yet; awaiting approval.

1. **TC-S1-57 (US-01 AC-3), integration, `test/auth.e2e-spec.ts`:** register `UnauthorizedFilter` in the test app as `main.ts` does, and assert that a no-token request gets 401 with `WWW-Authenticate: Bearer realm="connectsphere"` and `loginUrl: '/auth/login'`. This is a test-harness change only; the other converted files should register the filter too, so they match production.
2. **TC-S1-56 (US-01 AC-2), unit, login DTO:** a numeric `email` fails validation (400), rather than throwing in the transform.

## Scope

**Files measured** (the source behind the eight stories):
- **Auth (US-01):** `auth.service.ts`, `jwt.strategy.ts` and `dto/login.dto.ts`; plus the `login`, `logout` and `me` handlers in `auth.controller.ts`.
- **Shared:** `jwt-auth.guard.ts`, `roles.guard.ts`, the `current-user`, `roles` and `require-permission` decorators, `unauthorized.filter.ts`, `trim.transform.ts`, `is-after.validator.ts`, `access-control.service.ts` (ownership checks for US-05 and US-07 to 09), and `event-status.machine.ts`.
- **Event DTOs:** `create-event-request`, `draft-event-request`, `reject-request`, `return-request`, `ask-clarification` and `respond-clarification`.
- **`events.service.ts`, Sprint 1 methods:** `createAndSubmit`, `saveDraft`, `updateDraft`, `submitDraft`, `assertIsEditable`, `assertReadyForSubmission`, `draftFields`, `approve`, `askClarification`, `respondToClarification`, `reject`, `returnForAmendment`, `decide`, `claimForDecision`, `assertIsAssignedTo`, `setStatus`, `findMyRequests`, `findMyRequest`, `toOrganiserView`, `findAllForUser` and `findOneForUser`.
- **`events.controller.ts`, Sprint 1 handlers:** `create`, `saveDraft`, `updateDraft`, `submitDraft`, `approve`, `askClarification`, `respondToClarification`, `reject`, `returnForAmendment`, `findAll`, `findMine`, `findMineById` and `findOne`.

**Not measured:**
- **US-02, US-10 to US-15, and Week 7 Changes:**
  - `permission-matrix.ts` and `auth.controller.ts::permissions` (US-02).
  - `assignCoordinator`, `assertIsCoordinator`, `reassign` and `getReassignmentCandidates` (US-10, plus later reassignment).
  - `findAssignedRequests` and `findAssignedRequest` (US-12).
- **Later-sprint code in `events.service.ts`:** planning, technical requirements, change history, and change requests, including the `findLatestChangeDecision` and `findPendingChangeRequest` helpers that `findMyRequest` calls.
- **Bootstrap:** `*.module.ts`, `main.ts` and `prisma.service.ts`.

**How it was measured:**
- **Unit:** `npx jest --coverage --coverageReporters=json`.
- **Integration:** the 8 converted files (`auth`, `events-submit`, `events-draft`, `events-status-view`, `events-layout`, `events-review`, `events-decision`, `events-clarification`). They were run through `npx jest` with an inline config that matches `test/jest-e2e.json`, except that `rootDir` is the repo root. Jest can't collect coverage from `src/` when `rootDir` is `test/`.
  - It used the same `e2e-setup.ts` and `e2e-env.ts`, so the DB guard ran as usual. The run printed `host=localhost db=connectsphere_test` for both `DATABASE_URL` and `DIRECT_URL`.
- **Combined:** both suites are instrumented by ts-jest, and their statement and branch maps were checked to be identical for every file. Each statement or branch counts as covered if either suite hit it. The merge was a small script; no new package was installed.
