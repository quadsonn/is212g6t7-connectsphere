# Testing progress

Working log for Sprint 1 test cleanup on `sprint3-RAYE`. Item IDs refer to the "Action items" table in [audit.md](audit.md).

## Safety rules for test sessions
- Integration tests run only against local `connectsphere_test` (`localhost:5432`).
  - `test/e2e-env.ts` points `DATABASE_URL` and `DIRECT_URL` at `TEST_DATABASE_URL`.
  - Nest's `ConfigModule` and Prisma never overwrite an env var that is already set.
- Never run `prisma:seed`, `prisma:seed:roles`, `prisma migrate`, or `scripts/*`. They use `DATABASE_URL` from `.env`, which is the shared Supabase database.
- Allowed commands: `npx jest` (unit, fully mocked), `npm run test:e2e -- <file>` (test DB only), and `psql` on `localhost/connectsphere_test`.
- **Guard (since 2026-10-16):** `test/helpers/db-guard.ts` refuses any test database URL unless the host is `localhost`/`127.0.0.1` and the name contains `_test`. It runs in `e2e-setup.ts` (before `createdb` and migrate) and in `e2e-env.ts` (before every file).
  - Every helper that writes data also re-checks the live connection (`current_database()`, `host(inet_server_addr())`).
  - Proven: a non-local URL and a non-`_test` database name both stop the run in global setup, before anything connects.

## 2026-10-16: tighten weak assertions, capture whitespace bug

| Item | Change | Status |
|---|---|---|
| N1 | Deleted `event-status.machine.spec.ts` "has an entry for every status in the enum". The `Record<EventStatus, …>` type already enforces it, and "never lists a transition to itself" reads every entry. | Done |
| N2 | Deleted `test/app.e2e-spec.ts`, which held only `boots` (`expect(app).toBeDefined()`). Every other e2e file boots the same app, and `src/app.module.spec.ts` checks the dependency graph. | Done |
| W1 | `access-control.service.spec.ts` "finds an event they own" now asserts the returned event and the organiser-scoped query (US-02 AC-5). | Done |
| W2 ×5 | `events-assign.service.spec.ts` "allows assignment while %s" now asserts the returned `coordinatorId` and the exact update `{ coordinatorId }`, with no status write (US-10 AC-1/2). | Done |
| W3 | `venues-update.service.spec.ts` "allows clearing on a draft" now asserts `{ name: null, warnings: [] }` and the persisted `{ name: null }` (US-14 AC-4). | Done |
| M1 | `events-decision.e2e-spec.ts`: the test is retitled "…an empty string". A new "…whitespace-only" test is marked `BUG … (audit gap #1)`. | Done; **2 tests fail on purpose** until the trim fix lands |
| T1, T2 | 12-row `reports %s` tables in `events-status-view.service.spec.ts` and `events-review.service.spec.ts` | Done 2026-10-16 (see below) |

**Results**
- `npx jest`: 972 passed, 0 failed (was 973; N1 removed one test).
- `npm run test:e2e -- test/events-decision.e2e-spec.ts`: 24 passed, 2 failed. Both failures are the new whitespace rows: `expected 400, got 200`.

## 2026-10-16: Phase 1 pilot, shared test-DB reset and SQL setup scripts

| Item | Change | Status |
|---|---|---|
| Guard | `test/helpers/db-guard.ts`, wired into `e2e-setup.ts` and `e2e-env.ts` | Done, proven positive and negative |
| Reset | `test/helpers/reset-db.ts`: one `TRUNCATE … RESTART IDENTITY CASCADE` over every table from `information_schema` (except `_prisma_migrations`), after the runtime check | Done |
| Loader | `test/helpers/load-sql.ts`: runs `test/fixtures/sql/<name>.sql` in one transaction, after the runtime check. It splits on top-level `;` and respects strings, comments and `$$` bodies. No new dependency. | Done |
| Scripts | `test/fixtures/sql/base-setup.sql` (since split into `base-users.sql` and `base-venues.sql`): 6 users and 4 venues, fixed IDs, pre-computed bcrypt hash. `README.md` documents them, gives the password and psql usage, and explains why PostgreSQL not SQLite. | Done. Verified via psql: `User` 6, `Venue` 4, all other tables 0. |
| Pilot | `test/events-review.e2e-spec.ts` (US-07, 4 showcase tests). Its `beforeEach` is now `resetDb` + `loadSql('base-users')`. Removed: the `deleteMany` cleanup and per-test user seeding (bcrypt + login ×4 per test). Users log in once in `beforeAll`. Test bodies are byte-identical. | Done |

**Pilot results**
- 21/21 pass in 3 of 3 runs.
- File time: about **8.9 s → 1.2 s**. Average per test: **402 ms → 23 ms**.
- `npx jest`: 972/972.

**Flake found and fixed in the pilot:** `Parse Error: Expected HTTP/` came in bursts. A local Jupyter server holds loopback ports (ZeroMQ, not HTTP). Nest's dual-stack `[::]` listener can be given a port already taken on `127.0.0.1`, and Supertest then connects to the wrong process. The pilot now binds `app.listen(0, '127.0.0.1')`. Files not yet converted can still hit this.

### Remaining Sprint 1 integration files to convert (13)
`auth`, `access-control`, `events-submit`, `events-draft`, `events-status-view`, `events-layout`, `events-decision`, `events-clarification`, `events-assign`, `events-coordinator-view`, `venues`, `venues-update`, `venues-browse` (each `test/<name>.e2e-spec.ts`).

**Decided:** `base-setup.sql` is split into `base-users.sql` (loaded by every spec) and `base-venues.sql` (loaded only by specs that want the shared catalogue). Venue specs that seed their own venues load `base-users` only.

## 2026-10-16: script split, status-view tables, known-bug tests

| Item | Change | Status |
|---|---|---|
| Script split | `base-setup.sql` is now `base-users.sql` (6 users) and `base-venues.sql` (4 venues, load after users). The pilot loads `base-users` only. README and CONVENTIONS.md are updated to match. | Done. Verified via psql: users 6 / venues 0, then 6 / 4. Pilot 21/21 ×3 (1.07–1.22 s). |
| T1, T2 | Replaced each 12-row pass-through table with 4 rows (SUBMITTED, REJECTED, RETURNED, CANCELLED). Each row asserts the full `statusView`: decision and reason, `isTerminal`, `clarificationRequested`. | Done. 24 rows → 8. |
| M1 | The 2 whitespace-only tests in `events-decision.e2e-spec.ts` are now `it.failing.each`, with the comment "KNOWN BUG (audit gap #1) … Switch back to it(...) when the trim fix lands." | Done. File 26/26 green ×2 (about 10.8 s). |
| Port fix | `events-decision.e2e-spec.ts` now calls `app.listen(0, '127.0.0.1')` instead of `app.init()`. It hung for 5+ minutes otherwise (see below). No assertion changed. | Done |

**Why `events-decision` hung.** With `app.init()` alone, Supertest starts the server on a new random port for every request. macOS picks those ports from 49152–65535, where local Jupyter kernels hold `127.0.0.1` ports. A request that lands on one of them reaches Jupyter and either hangs (no reply) or fails with `Parse Error: Expected HTTP/` (non-HTTP reply). Binding once on `127.0.0.1` makes the OS skip those ports. **The other 12 unconverted Sprint 1 files still have this risk.** Apply the same one-line fix as each file is converted.

**Results:** `npx jest` 956/956 (972 − 24 + 8).

## Open
- **TC IDs:** CONVENTIONS.md asks every test to carry its TC ID and setup script in a comment. The TC catalogue (`TC-S1-XX`) doesn't exist yet. The pilot has a file-level pre-condition comment only.
- **G1 (whitespace accepted):** the fix is parked on `sprint3-raye-BACKUP`, in `src/common/validators/trim.transform.ts` and the 5 DTOs. Landing it is an application-code change, so agree it with the team first.
