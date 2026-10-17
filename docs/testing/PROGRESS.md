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

## 2026-10-17: story group 1 (US-07, US-08, US-09): test cases and integration conversion

**Part A: written test cases.** `docs/testing/sprint1-test-cases.md` has 22 test cases, TC-S1-01 to TC-S1-22, in the course template. Expected Results come from the AC wording.

| Story | TCs | Pass | Fail | Not Executed |
|---|---|---:|---:|---:|
| US-07 | TC-S1-01 to 07 | 6 | 0 | 1 (GAP: TC-07 concurrency, gap #2) |
| US-08 | TC-S1-08 to 14 | 6 | 1 (TC-11 whitespace reason, gap #1) | 0 |
| US-09 | TC-S1-15 to 22 | 5 | 0 | 3 (TC-15 Playwright pending; TC-18 GAP, whitespace question, gap #1; TC-20 notifications in progress, changed 2026-10-17) |
| **Total** | **22** | **17** | **1** | **4** (2 GAP, 1 Playwright, 1 notifications) |

**Part B: integration conversion.** `events-review`, `events-decision` and `events-clarification` now use the shared pattern:
- **Setup:** the app binds `127.0.0.1`, `beforeEach` runs `resetDb` + `loadSql('base-users')`, and users log in once in `beforeAll`.
- **Removed:** every `deleteMany`, every per-test user and event seed (`seedEvent`), and bcrypt.
- **Event data:** comes from the SQL scripts. Each test loads its scripts in its Arrange step (`await given('tc-s1-01-setup')`).

**New scripts**, documented in the fixtures README:
- `tc-s1-01-setup.sql`: 1 SUBMITTED request.
- `tc-s1-02-setup.sql`: 12 requests, covering every review state.
- `tc-s1-22-setup.sql`: a second Organiser.

**Assertions are unchanged.** The assertion lines (`expect(` and `.expect(`) were diffed before and after:
- Review: 39 = 39. Decision: 59 = 59. Clarification: 77 = 77.
- Clarification also gained one login check (`.expect(200)`) in the Arrange step of TC-S1-22, which needs the second Organiser's token.

**Traceability is checked mechanically.** All 36 "Automated by" references exist. Each one loads exactly the script(s) its test case's pre-condition names. TC-ID comments were added to the 36 referenced tests.

| File | Tests | Before | After (3 runs) |
|---|---:|---:|---:|
| `events-review.e2e-spec.ts` | 21 | about 8.9 s | 1.09–1.23 s |
| `events-decision.e2e-spec.ts` | 26 | about 10.8 s | 1.21–1.51 s |
| `events-clarification.e2e-spec.ts` | 25 | about 11.5 s | 1.25–1.44 s |

`npx jest`: 956/956.

**AC ↔ code mismatches**, also listed per story in the test-case file:
- **US-07 AC-3:** the code also requires an assigned Coordinator; an unassigned request returns 409.
- **Permission cases:** a non-assigned user gets 404 rather than an explicit "denied".
- **US-08 AC-2 and US-09 AC-1:** whitespace-only text is accepted (gap #1).
- **US-09 AC-4:** "notified" is a stored notification record only; nothing is delivered.

### Remaining Sprint 1 integration files to convert (11)
`auth`, `access-control`, `events-submit`, `events-draft`, `events-status-view`, `events-layout`, `events-assign`, `events-coordinator-view`, `venues`, `venues-update`, `venues-browse`

## 2026-10-17: story group 2 (US-03, US-04, US-05, US-06): test cases and integration conversion

**Context.** Week 7 Change 5 (Event Coordinator Lead and the unassigned queue) and Change 6 (Safety Officer) are being built on `Sprint3-MAIN` and are not yet on this branch. Expected Results follow the AC wording, updated for Change 5 where it applies. No test case cites a test that asserts the old, pre-Change-5 behaviour.

**Edits to group 1 test cases** (no renumbering):
- TC-S1-01, 04, 05, 06 and 07 gain the remark "Approval requires an assigned Coordinator, consistent with Week 7 Change 5". The US-07 mismatch note is marked resolved by Change 5.
- TC-S1-20 (US-09 AC-4) is now Not Executed: "Notifications in progress (Sprint 3 story: Be Notified of My Request Outcome)".
- The 404-for-denied cases now say "Denied = 404 by design (agreed decision)".

**Part A: written test cases.** TC-S1-23 to 54 (32 cases):

| Story | TCs | Pass | Fail | Not Executed |
|---|---|---:|---:|---:|
| US-03 | 23–30 | 6 | 0 | 2 (TC-25 GAP, pending Change 5 merge; TC-27 GAP, boundaries and whitespace gap #1) |
| US-04 | 31–38 | 7 | 0 | 1 (TC-34 Playwright pending) |
| US-05 | 39–46 | 8 | 0 | 0 |
| US-06 | 47–54 | 7 | 0 | 1 (TC-54 GAP, to be linked in group 3) |
| **Group 2** | **32** | **28** | **0** | **4** |
| **File total (groups 1 + 2)** | **54** | **45** | **1** | **8** (5 GAP, 2 Playwright, 1 notifications) |

**Part B: integration conversion.** `events-submit`, `events-draft`, `events-status-view` and `events-layout` now use the shared pattern:
- **Setup:** the app binds `127.0.0.1`, each test runs `resetDb` + `loadSql('base-users')`, and users log in once in `beforeAll`. The second Organiser comes from `tc-s1-22-setup`, loaded in `beforeAll` for the login and by each test that needs the user.
- **Removed:** `deleteMany`, `seedUser`, `seedRequest` and bcrypt.
- **No event seeding was needed** in `submit`, `draft` and `layout`, because those tests create requests through the API under test.

**New scripts**, all verified via psql and documented in the README:
- `tc-s1-39` (one request per status), `tc-s1-41` (2 rejected), `tc-s1-42` (3 drafts), `tc-s1-45` (1 approved) and `tc-s1-46` (mine and theirs).
- `tc-s1-54`: an assigned request with layout and accessibility, ready for the group 3 US-12 conversion.

**Assertions are unchanged** (assertion-line diffs): submit 55 = 55, draft 60 = 60, status-view 42 = 42, layout 58 = 58.

**Traceability is checked mechanically.** All 99 "Automated by" references across the 54 TCs load exactly their pre-condition scripts. TC comments were added to 63 referenced group 2 tests.

| File | Tests | Before | After (3 runs) |
|---|---:|---:|---:|
| `events-submit.e2e-spec.ts` | 21 | about 9.3 s | 1.16–1.41 s |
| `events-draft.e2e-spec.ts` | 20 | about 6.8 s | 1.07–1.22 s |
| `events-status-view.e2e-spec.ts` | 16 | about 5.0 s | 1.03–1.12 s |
| `events-layout.e2e-spec.ts` | 23 | about 7.2 s | 1.26–1.29 s |

`npx jest`: 956/956.

**Tests that assert pre-Change-5 behaviour.** These are not cited by any TC, and will need updating when Change 5 merges:
- `events-submit::makes the request visible to a Coordinator for review`
- `events-draft::makes it visible to a Coordinator once submitted`
- `events-layout::shows layout and accessibility in the review queue`
- `events-layout::shows them when the Coordinator opens the request`
- Group 1 has one too: `events-review::approves once that request has been assigned (US-10 then US-07)`, where a Coordinator assigns themselves from the pool.

**AC ↔ code mismatches**, detailed per story in the test-case file:
- **US-03 AC-2:** the shared Coordinator pool versus the Lead's queue.
- **US-03 AC-3:** whitespace is accepted (gap #1), and the boundaries are untested.
- **US-05 AC-4:** no action moves a new submission to UNDER_REVIEW.
- **US-06 AC-6:** the existing tests read the unassigned pool.

### Remaining Sprint 1 integration files to convert (7)
`auth`, `access-control`, `events-assign`, `events-coordinator-view`, `venues`, `venues-update`, `venues-browse`

## 2026-10-17: audit gap #1 fixed (Step 1) and regression test flipped (Step 2)

- **Step 1** (`93316fa`, application code, team-approved): `@Trim()` was restored from `sprint3-raye-BACKUP` and extended to every Sprint 1 text field:
  - Optional event and draft text fields are trimmed.
  - Venue name, location and notes now store real values trimmed. Blank values still become null.
  - Venue `operatingInfo` is trimmed.
  - Results: unit 956/956. The 11 integration files that use these endpoints pass, except the 2 `it.failing` rows, which flipped as expected.
- **Step 2:** the whitespace test in `events-decision.e2e-spec.ts` is back to `it.each`, commented "Fixed in 93316fa; regression test for audit gap #1". 26/26 ×3. TC-S1-11 is Fail → Pass. A "Changes since Sprint 1" section was added to `sprint1-test-cases.md`.
- **Next (Step 3):** tests for TC-S1-27 (US-03 boundaries), TC-S1-18 (whitespace-only question) and TC-S1-07 (concurrency, gap #2).

## 2026-10-17: Step 3, gap tests

| TC | New test(s) | Result |
|---|---|---|
| TC-S1-27 (US-03 AC-3) | `src/events/create-event-request.dto.spec.ts`: 15 boundary unit tests with a frozen clock (start −1 ms / at / +1 ms; end −1 ms / equal / +1 ms; attendance −1 / 0 / 1; "   " ×4; padded text trimmed). `events-submit::blocks boundary values and flags each field…`: 1 integration test. | Pass |
| TC-S1-18 (US-09 AC-1) | `events-clarification::rejects a whitespace-only question` | Pass (regression for gap #1) |
| TC-S1-07 (gap #2) | `events-review::lets exactly one of a simultaneous approve and reject succeed…`: 20 iterations of approve and reject together via `Promise.all`, with a fresh reset and setup each time. Marked `it.failing`. | Fail (known bug): reproduced in 60/60 probe iterations, with both calls 200 |

- Each file passed 3 runs: review 22/22, submit 22/22, clarification 26/26. `npx jest`: 971/971.
- The "Changes since Sprint 1" section records the gap tests and the Change 5 handover (TC-S1-25, TC-S1-54 and the 5 tests for the Sprint 3 tester).
- TC-S1-44 has the remark "Pending team decision on what triggers Under Review".
- CONVENTIONS.md "Open bugs": #1 is fixed, #2 is still open.

## 2026-10-17: story group US-01 (Log in securely): test cases and integration conversion

- **Safety:** branch `sprint3-RAYE`, connected to `localhost` / `connectsphere_test`. Only `npx jest` and `npm run test:e2e -- test/auth.e2e-spec.ts` were run.
- **Test cases:** TC-S1-55 to TC-S1-62 (8). 7 Pass. TC-S1-58 (AC-3 UI redirect) is Not Executed, Playwright (pending), and listed in Gaps. All pre-conditions: base-users.sql only.
- **Converted:** `test/auth.e2e-spec.ts`. It now uses `resetDb` + `base-users` before **every** test, so lockout counts can't leak between tests, and listens on `127.0.0.1`. Test bodies are byte-identical to `HEAD`: the diff shows no removed or changed `expect` lines. 21/21 passed 3 times (5.81 / 5.27 / 5.29 s; before: 5.28 s). The runtime is mostly real bcrypt compares.
- **New tests (window edge, allowed by the session rules):**
  - `src/auth/auth.service.lockout-window.spec.ts`: 3 unit tests with a frozen clock (exactly 30 min locks; 30 min + 1 ms restarts the count at 1; the correct password is refused while locked).
  - `auth.e2e-spec.ts::does not lock when the 15 failures are spread beyond 30 minutes`: 1 integration test. Only Date is faked; Supertest and Prisma keep real timers.
  - After these: auth e2e 22/22 ×3 (6.16 / 6.07 / 6.05 s; then 6.25 s). `npx jest`: 974/974.
- **Not mapped:** the 3 `DTO validation` tests in `auth.e2e-spec.ts` (malformed email, empty password, extra fields). They check input hygiene, not a US-01 AC. They are kept but carry no TC.
- **AC ↔ code mismatch flagged:** AC-5 fixed versus sliding 30-minute window (see the US-01 mismatch notes in sprint1-test-cases.md). The code is unchanged; this needs a team or customer decision.

## 2026-10-17: audit gap #2 fixed (Step 1) and race test flipped (Step 2)

- **Fix `61401ec`:** `claimForDecision()` in `events.service.ts` row-locks the request (`SELECT … FOR UPDATE`, only while it still holds the status that was read) as the first statement of approve, reject, return and request clarification. Otherwise it throws 409. It's a lock rather than `updateMany` because the team's status-write audit (`events-status-audit.spec.ts`) bans `eventRequest.updateMany`. `setStatus()` is still the only status writer. The three review specs gained a `$queryRaw` mock (setup only).
- **Step 2:** the TC-S1-07 test went from `it.failing` to `it`. The loser check is tightened from "any 4xx" to "409", and the stored `decisionReason` must match the winner. It passed 3 runs of 20 iterations (22/22 each).
- TC-S1-07 is now Pass. CONVENTIONS.md "Open bugs": #1 and #2 are both fixed.

## 2026-10-17: Step 3, part 1: concurrent clarification responses (audit gap #3)

- New test `events-clarification::accepts exactly one of two simultaneous responses to the same question` (TC-S1-63). Each of 20 iterations resets, loads base-users + tc-s1-01-setup, asks a question, then sends two responses with `Promise.all`. It expects one 201 and one 409, status UNDER_REVIEW, one stored answer and one Coordinator notification.
- **Bug reproduced in 57 of 60 probe iterations (19 of 20 in each of 3 runs).** Every bad iteration returned 201/201 with 2 answers stored and 2 notifications. Iteration 1, the first requests on a fresh server, was clean every time. Cause: `respondToClarification()` checks AWAITING_CLARIFICATION before its transaction.
- Captured as `it.failing` (audit gap #3). The file passed 27/27 in 3 runs.

## Open
- **TC IDs:** done for US-07/08/09, US-03/04/05/06 and US-01 (TC-S1-01 to 62). The remaining stories get theirs as each group is written.
- **Integration files still to convert:** `access-control`, `events-assign`, `events-coordinator-view`, `venues`, `venues-update`, `venues-browse`.
- **AC-5 window reading:** confirm fixed versus sliding with the team/customer.
- **G1 (whitespace accepted):** fixed in `93316fa`. TC-S1-18 and TC-S1-27 tests were added in Step 3.
