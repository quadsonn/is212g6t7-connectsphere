# Testing progress

Working log for Sprint 1 test cleanup on `sprint3-RAYE`. Item IDs refer to the "Action items" table in [audit.md](audit.md).

## Safety rules for test sessions
- Integration tests run only against local `connectsphere_test` (`localhost:5432`).
  - `test/e2e-env.ts` points `DATABASE_URL` and `DIRECT_URL` at `TEST_DATABASE_URL`.
  - Nest's `ConfigModule` and Prisma never overwrite an env var that is already set.
- Never run `prisma:seed`, `prisma:seed:roles`, `prisma migrate`, or `scripts/*`. They use `DATABASE_URL` from `.env`, which is the shared Supabase database.
- Allowed commands: `npx jest` (unit, fully mocked) and `npm run test:e2e -- <file>` (test DB only).

## 2026-10-16: tighten weak assertions, capture whitespace bug

| Item | Change | Status |
|---|---|---|
| N1 | Deleted `event-status.machine.spec.ts` "has an entry for every status in the enum". The `Record<EventStatus, …>` type already enforces it, and "never lists a transition to itself" reads every entry. | Done |
| N2 | Deleted `test/app.e2e-spec.ts`, which held only `boots` (`expect(app).toBeDefined()`). Every other e2e file boots the same app, and `src/app.module.spec.ts` checks the dependency graph. | Done |
| W1 | `access-control.service.spec.ts` "finds an event they own" now asserts the returned event and the organiser-scoped query (US-02 AC-5). | Done |
| W2 ×5 | `events-assign.service.spec.ts` "allows assignment while %s" now asserts the returned `coordinatorId` and the exact update `{ coordinatorId }`, with no status write (US-10 AC-1/2). | Done |
| W3 | `venues-update.service.spec.ts` "allows clearing on a draft" now asserts `{ name: null, warnings: [] }` and the persisted `{ name: null }` (US-14 AC-4). | Done |
| M1 | `events-decision.e2e-spec.ts`: the test is retitled "…an empty string". A new "…whitespace-only" test is marked `BUG … (audit gap #1)`. | Done; **2 tests fail on purpose** until the trim fix lands |
| T1, T2 | 12-row `reports %s` tables in `events-status-view.service.spec.ts` and `events-review.service.spec.ts` | **Waiting for approval** of the proposed rows |

**Results**
- `npx jest`: 972 passed, 0 failed (was 973; N1 removed one test).
- `npm run test:e2e -- test/events-decision.e2e-spec.ts`: 24 passed, 2 failed. Both failures are the new whitespace rows: `expected 400, got 200`.

## Open
- **G1 (whitespace accepted):** the fix is parked on `sprint3-raye-BACKUP`, in `src/common/validators/trim.transform.ts` and the 5 DTOs. Landing it is an application-code change, so agree it with the team first.
- **T1/T2:** waiting for approval.
- `docs/testing/CONVENTIONS.md` doesn't exist yet.
