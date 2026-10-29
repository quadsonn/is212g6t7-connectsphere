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

## 2026-10-17: Step 3, part 2: audit gap #3 fixed, test flipped, TC-S1-63

- **Fix:** `respondToClarification()` calls `claimForDecision()` as the first statement of its transaction. The status check before the transaction stays, so a response with nothing outstanding still gets the same 409 message as before. The conflict message is now neutral wording. `setStatus()` is still the only status writer, and the status-write audit is green. No spec mock changes were needed.
- The `it.failing` test reported "passed unexpectedly", then was flipped to `it`. Clarification passed 27/27 in 3 runs (60/60 iterations clean). Review 22/22, decision 26/26, `npx jest` 974/974.
- **TC-S1-63** written under US-09 (Pass), with a "Changes since Sprint 1" row. CONVENTIONS.md "Open bugs": #1, #2 and #3 are all fixed.

## 2026-10-17: test apps match production; coverage TEST gaps filled

- **Step 1 (`895d205`):** `src/configure-app.ts` holds the global setup (ValidationPipe, `UnauthorizedFilter`, CORS). `main.ts` and the 8 converted integration files call it; the deferred files are untouched. Before this, the test apps lacked the filter and CORS. No existing result changed: unit 974/974; the 8 files 178/178.
- **Step 2:** two new tests in `auth.e2e-spec.ts`. TC-S1-57: the 401 carries `WWW-Authenticate` and `loginUrl`, with no protected data. TC-S1-56: a numeric email gets 400 with a validation message. 24/24 in 3 runs.
- **Coverage re-measured:** combined 97.7% statements / 89.5% branches (was 96.0% / 87.9%). `UnauthorizedFilter` is now 100% of statements (its one remaining branch is unreachable and marked EXCLUDE), and the login DTO is 100%. No TEST gaps remain in coverage-s1.md.

## 2026-10-27: Sprint 3, Story 38 and 39 (TC-S3-38 to 53)

- **Prisma client regenerated** (`npx prisma generate`, no database touched): after the merge it was older than `schema.prisma`, so 46 unit suites and every integration file failed to compile. Afterwards: unit 1873/1873; the 15 Sprint 3-related integration files 361/361.
- **Story 38:** new `test/us38-attendee-change-notifications.e2e-spec.ts` (4 tests) and scripts `tc-s3-38/39/40-setup.sql`. Approved change request, replacement venue after a reversal, a multi-venue event, Registered vs Withdrawn, and a description-only edit.
- **Bug found (audit gap #4):** a venue replaced through the Story 52 replacement request tells no Attendee (TC-S3-40, `it.failing`).
- **Story 39:** new `test/us39-request-outcome-notifications.e2e-spec.ts` (6 runs: approve, reject, return and clarify table-driven; repeat approve; draft save). Uses `tc-s1-01-setup.sql`.
- Both files passed 3 runs against `localhost` / `connectsphere_test` (about 0.9 s each).
- **Code gaps recorded:** no email or polling worker, so Story 38 AC-7 and Story 39 AC-7 are Fail (TC-S3-46, 53); AC-3 content is checked in-app.
- **Next:** Story 40 (convert `us40-venue-notifications`, `notifications`), Story 41 (`bookings-suggestions`), Story 42 (`events-confirm`, Playwright), then the Sprint 3 coverage report.

## 2026-10-27: Sprint 3, Story 40 (TC-S3-54 to 62)

- **Converted** `test/us40-venue-notifications.e2e-spec.ts` (12 tests) and `test/notifications.e2e-spec.ts` (14 tests, 20 runs) to the shared pattern: `configureApp`, listen on 127.0.0.1, `resetDb` + base scripts in `beforeEach`, rows from `tc-s3` scripts instead of `deleteMany` and in-test seeding. Every assertion and test name is unchanged (diffed; the only new lines are the logins in `beforeAll`).
- 12 new scripts (`tc-s3-54` to `tc-s3-67`), with `USR-016`/`USR-017`, `VEN-039`/`VEN-040`, `EVT-194`/`EVT-195`, `BKG-079` to `BKG-081`, `NTF-001` to `NTF-023`.
- Runs: us40 12/12 ×3 (about 1.4 s), notifications 20/20 ×3 (about 1.8 s), on `localhost` / `connectsphere_test`. Frontend notification tests (Vitest): 29/29.
- All 9 Story 40 test cases Pass. AC-6 ("within 1 minute") rests on the notice being written in the action's transaction plus the bell's 60-second poll.
- One notifications test (US-41 AC-5) is tagged TC-S3-67 for Story 41.

## 2026-10-27: Sprint 3, Story 41 (TC-S3-63 to 69)

- **Converted** `test/bookings-suggestions.e2e-spec.ts` (29 tests, 36 runs) to the shared pattern. All 80 assertion statements and every test/describe name are unchanged (diffed). Each test now carries its TC comment and a `Code:` line.
- 11 new scripts (`tc-s3-63` to `tc-s3-68b`). To stay lean, the tests that only check "offered or not" share one catalogue script (`tc-s3-64`); only the exact-ranking and "nothing offered" tests need their own. Venue names (`mainHall`, `eastHall`, …) are kept because assertions quote them.
- Runs: 36/36 ×3 (about 2.6 s) on `localhost` / `connectsphere_test`; Story 41 UI tests (Vitest) 16/16.
- All 7 Story 41 test cases Pass; no AC ↔ code mismatch.

## 2026-10-27: Sprint 3, Story 42 (TC-S3-70 to 74) and coverage

- **Converted** `test/events-confirm.e2e-spec.ts` (23 tests): all 72 assertion statements and every name unchanged; each test tagged with its TC and `Code:` line. 13 small scripts (`tc-s3-70` to `tc-s3-73c`). 23/23 ×3 (about 2.1–2.5 s) on `localhost` / `connectsphere_test`. Confirm card UI tests 6/6.
- **Browser test:** `e2e/us42-confirm.spec.ts` (2 tests: Confirm disabled with the checklist; a ready event confirmed and seen by the Organiser). After `npm install` (lockfile unchanged) and `npx playwright install chromium`, it passed 3 runs against `connectsphere_test` on localhost (about 10 s).
- All 5 Story 42 test cases Pass. AC-4: confirming moves to AWAITING_SAFETY_CHECK (Week 7 Change 6), noted.
- **Coverage** ([coverage-s3.md](coverage-s3.md)): Story 38–42 files combined 97.7% statements / 80.2% branches. Both TEST gaps then got their tests (Story 41 accept refused for a started slot or no attendance, `tc-s3-68c-setup.sql`; Story 40 another user's cursor): combined now 98.6% / 82.1%. The rest is DEFERRED (Story 45/52/54/57) or EXCLUDE.

## 2026-10-27: Sprint 3, Story 43 to 47 (TC-S3-75 to 112)

- **Story 43 (new):** `test/us43-cancel-event.e2e-spec.ts` (8 tests, 14 runs) through the real `POST /events/:id/cancel`, and `e2e/us43-cancel.spec.ts` (1 browser test). One expectation corrected: registering for a cancelled event is refused with 404 (not visible), not 409.
- **Converted** to reset + setup scripts, assertions unchanged (diffed): `us44-release-on-cancel` (10 tests, 27 assertion statements identical), `equipment-status` (25 tests; 40 of 42 identical, 2 changed only in the user's display name: "tech"/"coordinator" became the base users' "Toby Tech"/"Cody Coordinator"), `registrations-period-capacity` (64 identical; clock frozen at 1 Mar 2030, Date only, before login), `events-reject-unfulfillable` (47 identical). Every test tagged with its TC and `Code:` line.
- **New tests:** Story 46 AC-2 boundary (registering exactly at the closing time is accepted); Story 46 AC-7 UI test `register-action.test.tsx` (4 runs).
- Runs, 3 each on `localhost` / `connectsphere_test`: us43 14/14, us44 10/10, equipment-status 34/34, registrations 27/27, reject-unfulfillable 30/30; browser us43 1/1; UI tests for cancel panel 8/8, booking history 2/2, equipment status 7/7, register action 4/4, reject-unfulfillable 4/4.
- **Story 45 code gaps:** equipment status is per item, not per unit. AC-1, 3, 4, 5 (breakdown), 6 (short count), 7 (flag), 8–11 are Fail (TC-S3-88, 90–98); AC-2 Pass.
- **Coverage** (coverage-s3.md): Story 43–47 files combined 99.5% statements / 84.4% branches; nothing left to test (all EXCLUDE).
- 20 new scripts (`tc-s3-75` to `tc-s3-107b`).

## 2026-10-27: Sprint 3, Story 48 to 57 (TC-S3-113 to 186)

- **Converted** to reset + setup scripts, every test tagged with its TC and `Code:` line, assertions diffed against the originals: `events-change-request-check` (Story 48, 101 assertion statements identical), `venue-buffers` (49, 17), `venues-buffers` (50, 42), `booking-review-flags` (51, 59), `bookings-venue-unavailable` (52, 66), `bookings-multi-venue` (53, 80), `us54-venue-holds` (54, 70; 1 changed only in the Coordinator's display name, "coordinator" → "Cody Coordinator"), `events-assignment` (55/56, 93; 1 changed only in the Organiser's email, "organiser@example.com" → "olive@example.com"), `safety-check` (57, 139 identical).
- `events-assignment` loads its own users (`tc-s3-159-setup.sql`, `USR-028` to `USR-032`) instead of `base-users`: its tests need exactly two Coordinators. `safety-check` adds two Safety Officers (`USR-033`, `USR-034`). Hold expiries are relative to the database clock (`now() AT TIME ZONE 'UTC'`), so no frozen clock was needed.
- Kept by design: the US-54 backstop test still writes an overlapping hold directly (the write is the act under test); events reach the Safety queue through the real Confirm endpoint.
- **New tests (coverage TEST gaps):** a draft venue or unknown event cannot be held; the hold tick (new unit spec, 2 tests); a decision on or history of an unknown event; resubmitting an event cancelled while feedback waited; an event leaving the Safety queue once its equipment is released.
- **New UI tests:** `lead-queue.test.tsx` (Story 55: entry fields, open and assign, the current assignee on a clash), `safety-review.test.tsx` (Story 57: the review contents; stage and reason required), and one Story 56 test in `lead-assignments.test.tsx` (counts and filter). The existing UI tests for Stories 48–54 are cited in the test cases. No browser test added: every UI-only AC is covered by a UI test.
- Runs, 3 each on `localhost` / `connectsphere_test`: change-request-check 34/34, venue-buffers 21/21, venues-buffers 29/29, booking-review-flags 24/24, bookings-venue-unavailable 28/28, bookings-multi-venue 17/17, us54 35/35, events-assignment 33/33, safety-check 41/41; hold tick unit 2/2; new UI tests 8/8. Full unit suite 1875/1875; full frontend suite 366/366.
- All 74 test cases Pass. Story 52 AC-5 noted open bug #4 (TC-S3-40), since fixed (2026-10-28 entry).
- **Coverage** (coverage-s3.md): Story 48–57 files combined 98.5% statements / 85.1% branches (from 96.9% / 82.3% before the gap tests); the rest is EXCLUDE. Three helpers have no caller (`overlapping`, `committedOverlapping`, `isHeld`): flagged for the team, not removed.
- 90 new scripts (`tc-s3-113` to `tc-s3-185`), all listed in the fixture README.

## 2026-10-28: merged sprint4-main and sprint4-marilyn; audit gap #4 fixed; unused helpers deleted

- **Merged** `origin/sprint4-main` (`1776b73`, the Story 45 equipment substitutions, with a new migration) and `origin/sprint4-marilyn` (`c1b87c7`, `bb85a11`, Sprint 2 test regeneration) into `Sprint4-RAYE`. No conflicts; the one file both sides changed (`equipment-reservations.service.spec.ts`) passes 29/29. The new migration was applied to `localhost` / `connectsphere_test` only, by the test setup.
- **Audit gap #4 fixed** (team-approved): `BookingsService.notifyAttendeesIfVenueReplaced` now checks the approved booking's `replacesBookingId` first, so a confirmed Story 52 replacement tells the Registered Attendees "Venue: old → new". The reversal route is unchanged. The TC-S3-40 test went from `it.failing` to `it` and passed 3 runs; TC-S3-40 is now Pass.
- **Deleted** the unused `overlapping()` and `committedOverlapping()` (`src/bookings/booking-overlap.ts`) and `isHeld()` (`src/safety/safety-readiness.service.ts`), team-approved. No behaviour change.
- Runs: unit 1893/1893; us38 4/4 ×3; the 11 integration files that use replacements, overlaps or the safety queue 306/306.
- **Coverage** (coverage-s3.md, Story 48–57): 99.0% statements / 86.8% branches (from 98.5% / 85.1%).

## 2026-10-29: Story 48 to 57 at 100% coverage

- Course requirement: "100% coverage unless not possible and stated why". The remaining 8 statements and 32 branches were all reachable, so none needed an "impossible" reason.
- **23 new unit tests** reach the paths the running app cannot: name fallbacks, default parameters, race guards and database failures, built with mocks. 5 new spec files (`safety/safety.service.spec.ts`, `safety/safety-readiness.service.spec.ts`, `bookings/hold-expiry.spec.ts`, `bookings/holds.service.spec.ts`, `events/change-arrangement-check.service.spec.ts`) and additions to 6 existing ones. Each test tagged with its TC and `Code:` line, and listed in its test case's "Automated by".
- Stale references to the deleted `isHeld()` removed: one comment in `safety.service.ts` (`decide`), three `Code:` tags in `safety-check.e2e-spec.ts`.
- Runs: the 11 touched unit specs 100/100 ×3; full unit suite 1916/1916; the 9 Story 48–57 integration files 262/262 on `localhost` / `connectsphere_test`.
- **Coverage** (coverage-s3.md): Story 48–57 files combined **100% statements (769/769), 100% branches (243/243)**.

## 2026-10-29: Story 38 to 47 at 100%; full suite green

- **Full integration suite** (68 files) on `localhost` / `connectsphere_test`: first run 67/68, `equipment-substitutions.e2e-spec.ts` (Felecia, from the `sprint4-main` merge) failed 44 tests when run after other files. Its `clear()` deleted table by table and missed `VenueBlock`, so `user.deleteMany()` hit a foreign key; the same failure in `afterAll` left the app open, so Jest never exited. **Fixed (test only):** `clear()` now calls the guarded `resetDb`. No assertion changed. Re-run: **68/68 files, 1426/1426 tests**, Jest exits cleanly.
- **22 new unit tests** for Stories 38–47 (6 new spec files: `venue-activity-notifier`, `notifications-inbox.service`, `booking-suggestions`, `cancel-event.dto`, `events-unfulfillable.service`, `equipment-change-status.service`; additions to 9 existing ones), each tagged and listed in its test case's "Automated by".
- Runs: the 15 touched unit specs 180/180 ×3; `equipment-substitutions` 44/44 ×3 (twice alone, once in the full run); full unit suite 1938/1938.
- **Coverage** (coverage-s3.md, "Story 38 to 47 at 100%"): **100% statements (572/572), 99.6% branches (245/246)**. The one branch cannot run and the reason is stated (`confirmation-readiness.rules.ts:65`, only live bookings reach it).
- Sprint 3 coverage requirement now met for Story 38–57.

## 2026-10-29: Sprint 4, Story 58 to 62 (TC-S4-58 to 89)

- **New doc:** [sprint4-test-cases.md](sprint4-test-cases.md) (32 test cases, all Pass after the gap #5 fix) and [coverage-s4.md](coverage-s4.md).
- **Story 58:** `events-clarification` already used the reset pattern; its 11 US-58 tests were marked "No TC ID yet" and are now tagged TC-S4-58 to 64. Added the list view to the AC-1 test. New browser test `e2e/us58-clarification-response.spec.ts` (reply with an updated detail) with `tc-s4-58-setup.sql`.
- **Story 59:** had unit tests only. New integration file `test/us59-registration-notices.e2e-spec.ts` (7 tests; the sweeps are called with the moment to judge by; registrations, withdrawals and capacity changes go through the API). **Gap #5 found and fixed** (approved): the "opens" notice was sent on confirmation, before registration actually opens. `notifyOpened` now skips events not yet open (`resolveWindow`), as `notifyClosed` does. The first `it.failing` test judged at a date already after the opening time, so it proved the gap the wrong way; corrected to judge before (1 Sep) and after (2 Oct). The corrected test fails without the fix and passes with it.
- **Story 60:** `us60-equipment-status-alerts` converted to reset + scripts (15 assertions identical; `tc-s4-73-setup.sql` adds Wei, Nadia and Omar).
- **Story 61:** `us61-technical-support-assignment` converted (36 assertions identical); it loads its own users (`tc-s4-76-setup.sql`, instead of base-users) because it needs exactly two Technical Support members. 2 new integration tests (same or unknown member, cancelled event, removing with nobody assigned).
- **Story 62:** its behaviour was already in `safety-check` under Story 57; 15 tests now carry both stories' TC IDs. 2 new integration tests (the Coordinator sees the stage and flagged arrangements; blocked while equipment is not reserved), new UI test `safety-history.test.tsx`, new browser test `e2e/us62-safety-resubmit.spec.ts` with `tc-s4-80-setup.sql`.
- **Test-isolation fix:** converted files reset at the start, not the end, which broke four files that still deleted table by table (`event-submitted-notification`, `events-cancel-confirmation`, `events-required-facilities`, `us66-technical-support-notifications`; one hung for 23 minutes). Their clean-up now calls `resetDb`; no assertion changed. No test file now deletes users directly.
- **New unit tests:** `events-technical-support.service.spec.ts` (3), `registration-notifications.scheduler.spec.ts` (1), and additions to the registration-notifications, equipment-status-notifier and events-clarification service specs (5).
- Runs on `localhost` / `connectsphere_test`: full integration suite 69/69 files, 1437 tests; the converted and new files ×3; browser tests us58 and us62 ×3; touched unit specs 51/51 ×3; unit suite 1946/1946; new UI test 2/2.
- **Coverage** (coverage-s4.md): Story 58–62 files **100% statements (309/309), 100% branches (106/106)**, from 94.5% / 80.2%.
- 17 new scripts (`tc-s4-58` to `tc-s4-80`), listed in the fixture README with users USR-035 to USR-043.

## 2026-10-29: Sprint 4, gap #5 fixed; Story 63 to 67 (TC-S4-90 to 110)

- **Gap #5 fixed** (approved): see the Story 58–62 entry. TC-S4-65 Pass; all 32 Story 58–62 test cases Pass.
- **Story 63:** `event-submitted-notification` converted to setup scripts (21 assertions unchanged; `tc-s4-90-setup.sql` adds a second Lead) and a new AC-6 test (the notice is recorded within the submission).
- **Story 64:** already tested in `safety-check`; its 5 tests now tagged TC-S4-96 to 99.
- **Story 65:** assignment notices tagged in `events-assignment`; `events-cancel-confirmation` converted (12 assertions identical; `tc-s4-102`, `102b`, `103`).
- **Story 66:** `us66-technical-support-notifications` converted (24 assertions identical). It reuses `tc-s4-76-setup.sql` instead of base-users (the "pool" must be exactly Wei and Nadia); `tc-s4-104` to `105b` add the event and its variants through the same seed helpers, so no test body changed.
- **Story 67:** Felecia's `equipment-substitutions` converted (59 assertions identical; `tc-s4-110` to `110q`). Writes made after a suggestion stay in the tests, marked "kept by design". New integration tests: answers that cannot stand (unknown or released reservation, both choices, unknown item), the dropdown leaving out a held item and ordering same-type items, acceptance refused once the reservation is released or the original is back in service, and (in `events-cancel-confirmation`) the Coordinator told when cancelling releases their equipment.
- **New unit tests:** name fallbacks and failures in the equipment, safety-check, request and Technical Support notifiers (5), plus two existing equipment-notifier tests tagged for AC-3.
- Runs on `localhost` / `connectsphere_test`: full integration suite 69/69 files, 1444 tests; converted and changed files ×3; touched unit specs ×3; unit suite 1951/1951.
- **Coverage** (coverage-s4.md): Story 63–67 files **100% statements (496/496), 100% branches (157/157)**. Three backstops in the substitutions service that the app cannot reach (each guaranteed by an earlier check or a foreign key) are covered by unit tests with a mocked database, `equipment-substitutions.service.spec.ts` (3 tests, ×3). Story 58–62 still 100%. Unit suite 1954/1954.
- **Test cases:** [sprint4-test-cases.md](sprint4-test-cases.md) now TC-S4-58 to 110, 53 in all, all Pass. 30 more scripts (`tc-s4-90` to `tc-s4-110q`) and users USR-044, USR-045 in the fixture README.

## Open
- **TC IDs:** Sprint 1 TC-S1-01 to 62; Sprint 3 TC-S3-38 to 186 (Story 38 to 57); Sprint 4 TC-S4-58 to 110 (Story 58 to 67).
- **Integration files still to convert:** `access-control`, `events-assign`, `events-coordinator-view`, `venues`, `venues-update`, `venues-browse`.
- **AC-5 window reading:** confirm fixed versus sliding with the team/customer.
- **G1 (whitespace accepted):** fixed in `93316fa`. TC-S1-18 and TC-S1-27 tests were added in Step 3.
