# Sprint 1 test cases

Written test cases for the Sprint 1 user stories (US-01 to US-15), traced from story → acceptance criterion → test case → automated test. Stories appear in the order of the Sprint 1 user-story document, and story and AC numbers follow it and [docs/BACKLOG.md](../BACKLOG.md). AC numbers count the bullets in the order the story lists them.

**Regeneration in progress (2026-10-26).** After the Sprint 3 and Sprint 4 merges, every story is being re-checked against its acceptance criteria and given UI and browser tests. Done: **US-01 to US-08**. US-09 still shows the 17 Oct results, and US-10 to US-15 get their test cases in the coming batches.

## How to read this file

- Each test case is one table in the course template. The top part is the test case specification and the bottom part is the test execution record.
- **Pre-conditions** name the exact SQL setup script(s) the test case needs. The integration and browser tests load that same script, which is the traceability link. Scripts live in `test/fixtures/sql/`, and its [README](../../test/fixtures/sql/README.md) lists every row they create. All fixture users share the password `correct-horse-battery-staple`.
- **Expected Result** is written from the AC wording, not from the code. Where the two disagree, the mismatch is listed at the end of each story.
- **Automated by** gives `<type>: <file>::<exact test name>`. Unit tests are cited by their `describe` block where the whole block serves the test case. Test names with `%s` are table-driven (`it.each`), and every row is run.
- **Test case IDs are stable.** TC-S1-01 to TC-S1-63 keep the numbers they had on 17 Oct, so commits, `audit.md` and `coverage-s1.md` still point at the right case; new test cases continue from TC-S1-64. Within a story they are listed by acceptance criterion.
- **Week 7 changes are merged.** Change 5 (the Event Coordinator Lead and the unassigned queue) and Change 6 (the Safety Officer's check) are in the code. Expected Results follow them: a new submission goes to the Lead's queue, and Coordinators see only requests assigned to them.
- **Denied = 404 by design.** A user who may not see a request gets 404 rather than 403, so its existence isn't revealed. Remarks note this wherever it applies.

**Test types**

| Type | Where | What it runs | Command |
|---|---|---|---|
| **Unit** | `src/**/*.spec.ts` | One service, rule, guard or DTO on its own; Prisma and other dependencies mocked | `npm test` |
| **Integration** (also the functional tests) | `test/*.e2e-spec.ts` | The real Nest app over HTTP (Supertest) and the local `connectsphere_test` database; one `describe` per AC | `npm run test:e2e` |
| **UI** | `frontend/src/**/*.test.tsx` | React screens rendered with React Testing Library and Vitest; the API mocked | `npm --prefix frontend test` |
| **E2E** (browser) | `e2e/*.spec.ts` | Playwright drives Chromium through the real React app, the real API and the local test database | `npm run test:browser` |

All four use only the local test database (or none). None touches the shared Supabase database.

**Legend**

| Value | Meaning |
|---|---|
| Status **Pass** | Every listed automated test ran and the system behaved as the Expected Result says. |
| Status **Fail** | The system does not do what the AC asks. Remarks name the bug or gap. |
| Status **Not Executed** | No automated test exists yet. |
| Automated by **GAP** | No test covers this test case yet. It is listed in "Gaps". |

---

## US-01 Log in securely (all roles)

### TC-S1-55

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-55 |
| Story/AC ref | US-01 AC-1 |
| Test Scenario | A registered user with valid credentials is authenticated and gets a session |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Not logged in. Account organiser@example.com (Olivia Organiser) exists with no failed attempts. |
| Test Steps | 1. Olivia logs in with her email and correct password.<br>2. She inspects the token she receives.<br>3. She opens a protected route (`GET /auth/me`) with that token. |
| Test Data | organiser@example.com / correct-horse-battery-staple |
| Expected Result | Olivia is authenticated. She receives an access token that identifies her and her role, and the token opens protected routes. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/auth.e2e-spec.ts::returns 200 with an access token`<br>Integration: `test/auth.e2e-spec.ts::issues a token carrying userId and role`<br>Integration: `test/auth.e2e-spec.ts::establishes a session that opens protected routes`<br>Unit: `src/auth/auth.service.spec.ts::AuthService (US-01) AC-1: valid credentials establish a session` |

### TC-S1-64

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-64 |
| Story/AC ref | US-01 AC-1, AC-2 (UI) |
| Test Scenario | Signing in on the login screen: valid credentials open the user's own dashboard; wrong credentials show the generic error |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Not logged in. |
| Test Steps | 1. On the login page, enter organiser@example.com and the correct password, and click "Sign in".<br>2. Sign out, then enter organiser@example.com with a wrong password.<br>3. Enter nobody@example.com with the correct password. |
| Test Data | Correct password: `correct-horse-battery-staple`; wrong password: `wrong-password` |
| Expected Result | Valid credentials sign the user in and open their role's dashboard (the Organiser's "My event requests"). For both bad attempts the page stays on the login screen, shows the same message ("invalid email or password"), which does not say which field was wrong, and keeps no session. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | Valid credentials opened `/organiser` with "My event requests". Both failures showed the identical alert text and left no token in the browser. |
| Status | Pass |
| Remarks | The API's response is TC-S1-55 and TC-S1-56; this case checks what the user sees. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | UI: `frontend/src/features/auth/auth-ui.test.tsx::Given valid credentials, Then it stores the session and opens the role’s dashboard`<br>UI: `frontend/src/features/auth/auth-ui.test.tsx::Given wrong credentials, Then it shows the generic error, stays on the login page and stores no session`<br>E2E: `e2e/us01-login.spec.ts::AC-1: valid credentials sign in and open the user’s own dashboard`<br>E2E: `e2e/us01-login.spec.ts::AC-2: a wrong password and an unknown email show the same generic error and stay on the login page` |

### TC-S1-56

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-56 |
| Story/AC ref | US-01 AC-2 |
| Test Scenario | A wrong password and an unknown email get the same generic error, and no token |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Not logged in. Account organiser@example.com exists; nobody@example.com does not. |
| Test Steps | 1. Log in as organiser@example.com with a wrong password.<br>2. Log in as nobody@example.com with a password.<br>3. Compare the two responses.<br>4. Log in with a number as the email. |
| Test Data | organiser@example.com / wrong-password; nobody@example.com / correct-horse-battery-staple; email `12345` (a number) |
| Expected Result | Both attempts are refused with the same generic message, "invalid email or password", and no token. The two responses are identical, so neither reveals which field was wrong. A malformed email (not a string) is refused as invalid input with a validation message, not a server error, and no token. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The screen side (the message shown on the login page) is TC-S1-64. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/auth.e2e-spec.ts::rejects a wrong password with 401 and no token`<br>Integration: `test/auth.e2e-spec.ts::rejects an unknown email with 401 and no token`<br>Integration: `test/auth.e2e-spec.ts::returns byte-identical bodies for both, revealing neither field`<br>Integration: `test/auth.e2e-spec.ts::rejects a non-string email with 400 and a validation message`<br>Unit: `src/auth/auth.service.spec.ts::AuthService (US-01) AC-2: wrong credentials are rejected generically` |

### TC-S1-66

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-66 |
| Story/AC ref | US-01 AC-2 (boundary: malformed input) |
| Test Scenario | A malformed email, a non-string email or an empty password is refused before any credential check, and a client-supplied role is ignored |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). |
| Test Steps | 1. `POST /auth/login` with email `not-an-email`.<br>2. With email `12345` (a number).<br>3. With an empty password.<br>4. With valid credentials plus `role: EVENT_COORDINATOR`. |
| Test Data | organiser@example.com / `correct-horse-battery-staple` |
| Expected Result | Steps 1–3 are refused with 400 and no token, without counting toward the lockout. Step 4 signs in, and the session's role is the stored one (Organiser), not the one sent. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | Steps 1–3: 400, with "email must be a valid email address" for the number. Step 4: 200; the extra field was stripped. |
| Status | Pass |
| Remarks | These four tests had no test case before the regeneration. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/auth.e2e-spec.ts::rejects a malformed email with 400`<br>Integration: `test/auth.e2e-spec.ts::rejects a non-string email with 400 and a validation message`<br>Integration: `test/auth.e2e-spec.ts::rejects an empty password with 400`<br>Integration: `test/auth.e2e-spec.ts::ignores unexpected fields rather than trusting them` |

### TC-S1-57

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-57 |
| Story/AC ref | US-01 AC-3 (API) |
| Test Scenario | A request without a valid token is refused at the API, and no data is returned |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Not logged in. |
| Test Steps | 1. Call `GET /auth/me` with no token.<br>2. Call it with a malformed token.<br>3. Call it with a token signed with the wrong secret.<br>4. Call `POST /auth/logout` with no token. |
| Test Data | No header; `Bearer not-a-real-token`; a forged HS256 token for `user-1` / ATTENDEE |
| Expected Result | Every request is refused as unauthenticated (401), and no protected data is returned. The refusal tells the client where to log in: a `WWW-Authenticate` header and the login URL in the body. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The browser redirect is TC-S1-58. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/auth.e2e-spec.ts::rejects a request with no token`<br>Integration: `test/auth.e2e-spec.ts::points an unauthenticated caller at the login page`<br>Integration: `test/auth.e2e-spec.ts::rejects a malformed token`<br>Integration: `test/auth.e2e-spec.ts::rejects a token signed with the wrong secret`<br>Integration: `test/auth.e2e-spec.ts::rejects logout without a token` |

### TC-S1-58

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-58 |
| Story/AC ref | US-01 AC-3 (UI) |
| Test Scenario | An unauthenticated user who opens a protected page is redirected to the login page |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Not logged in; no token in the browser. |
| Test Steps | 1. Open the Organiser's event list (`/organiser`) directly in the browser, without signing in. |
| Test Data | — |
| Expected Result | The user is redirected to the login page, and no protected content is shown. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The browser is sent to `/login` and the Sign in form is shown. The Organiser's list heading never renders. |
| Status | Pass |
| Remarks | Frontend redirect (ProtectedRoute). The API half, a 401 with `loginUrl`, is TC-S1-57. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | UI: `frontend/src/features/auth/auth-ui.test.tsx::Given no session, When a protected page is opened directly, Then it redirects to /login and renders nothing protected`<br>E2E: `e2e/us01-login.spec.ts::AC-3: opening a protected page directly while signed out lands on the login page` |

### TC-S1-59

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-59 |
| Story/AC ref | US-01 AC-4 |
| Test Scenario | Logging out ends the session, and the old token can't be reused |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Olivia (organiser@example.com) logs in during the test. |
| Test Steps | 1. Olivia logs in and opens `GET /auth/me`.<br>2. She logs out.<br>3. She reuses the same token on `GET /auth/me`.<br>4. She logs in again and opens `GET /auth/me`.<br>5. With two sessions open, she logs out of one and uses the other. |
| Test Data | organiser@example.com / correct-horse-battery-staple |
| Expected Result | Logout ends the session. Reusing the old token is refused (401), and access needs a new login. Logging out one session leaves her other sessions alone. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The Sign out control on screen is TC-S1-65. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/auth.e2e-spec.ts::returns 204 and makes the token unusable afterwards`<br>Integration: `test/auth.e2e-spec.ts::requires logging in again to regain access`<br>Integration: `test/auth.e2e-spec.ts::does not revoke other sessions belonging to the same user`<br>Unit: `src/auth/auth.service.spec.ts::AuthService (US-01) AC-4: logout revokes the presented token` |

### TC-S1-65

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-65 |
| Story/AC ref | US-01 AC-4 (UI) |
| Test Scenario | Signing out from the user menu ends the session; protected pages then need signing in again |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com in the browser. |
| Test Steps | 1. Open the user menu in the top bar and click "Sign out".<br>2. Open `/organiser` directly.<br>3. Call the API with the old token. |
| Test Data | — |
| Expected Result | Signing out returns the user to the login page, removes the session from the browser and revokes the token on the server. Opening a protected page afterwards leads to the login page. If the server ends a session, the login page says "Your session has ended. Please sign in again." |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | Sign out led to `/login` with no stored token; `/organiser` redirected to `/login`; the old token got 401 from `/auth/me`. A failed logout call still ended the session locally. |
| Status | Pass |
| Remarks | The server side (revoking the jti) is TC-S1-59. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | UI: `frontend/src/features/auth/auth-ui.test.tsx::Given a signed-in user, When they sign out, Then the server is told and the stored session is cleared`<br>UI: `frontend/src/features/auth/auth-ui.test.tsx::Given the logout call fails, Then the session still ends locally`<br>UI: `frontend/src/features/auth/auth-ui.test.tsx::Given the session ended, Then the login page says so`<br>E2E: `e2e/us01-login.spec.ts::AC-4: signing out ends the session; protected pages need signing in again` |

### TC-S1-60

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-60 |
| Story/AC ref | US-01 AC-5 (14/15 boundary) |
| Test Scenario | 14 failures leave the account open; the 15th locks it, and further attempts, even with the correct password, get the helpline message |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before every test, so no failed-attempt count carries over). Not logged in. Account organiser@example.com has 0 failed attempts and no lock. |
| Test Steps | 1. Fail 14 times in a row, then check the account and log in correctly.<br>2. (Fresh reset) Fail 15 times in a row, then try once more with a wrong password.<br>3. (Fresh reset) Fail 15 times in a row, then try with the correct password. |
| Test Data | organiser@example.com / wrong-password ×14 or ×15; then correct-horse-battery-staple |
| Expected Result | After 14 failures the account is not locked, and the correct password logs in. After 15 consecutive failures within 30 minutes the account is temporarily locked. Every further attempt, including one with the correct password, is refused with a message directing the user to the IT helpline, and no token is issued. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The 15th failure itself still returns the generic 401. The helpline message appears from the next attempt, which matches "further attempts". |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/auth.e2e-spec.ts::stays open for the first 14 failures`<br>Integration: `test/auth.e2e-spec.ts::locks on the 15th and points the user at the helpline`<br>Integration: `test/auth.e2e-spec.ts::refuses the correct password while locked`<br>Unit: `src/auth/auth.service.spec.ts::AuthService (US-01) AC-5: lockout after 15 failures in 30 minutes` |

### TC-S1-61

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-61 |
| Story/AC ref | US-01 AC-5 (30-minute window edge) |
| Test Scenario | 15 failures count toward a lock only when they fall within 30 minutes; failures spread beyond 30 minutes don't lock |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Not logged in. Account organiser@example.com has 0 failed attempts. The clock is frozen at T0 (Date only), with no real waiting. |
| Test Steps | 1. (Integration) Fail 14 times at T0.<br>2. Move the clock to T0 + 30 min + 1 ms and fail a 15th time.<br>3. Check the account, then log in with the correct password.<br>4. (Unit) With 14 failures since T0, fail a 15th time at exactly T0 + 30 min.<br>5. (Unit) With 14 failures since T0, fail a 15th time at T0 + 30 min + 1 ms.<br>6. (Unit) While a lock is in force, log in with the correct password. |
| Test Data | organiser@example.com / wrong-password; correct-horse-battery-staple. T0 = test start (integration) or 2030-06-01T12:00Z (unit). |
| Expected Result | A 15th failure at exactly 30 minutes is still within the window and locks the account. A 15th failure after 30 minutes does not lock it, and counting starts again from that failure, so the correct password still logs in. While a lock is in force, the correct password is refused with the helpline message. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | New tests, added this session (lockout window edge). See the mismatch note below on fixed versus sliding windows. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/auth.e2e-spec.ts::does not lock when the 15 failures are spread beyond 30 minutes`<br>Unit: `src/auth/auth.service.lockout-window.spec.ts::locks when the 15th failure lands exactly 30 minutes after the first (still within the window)`<br>Unit: `src/auth/auth.service.lockout-window.spec.ts::does not lock when the 15th failure lands 1 ms after the window closes; the count restarts at 1`<br>Unit: `src/auth/auth.service.lockout-window.spec.ts::refuses the correct password with the helpline message while a lock is in force` |

### TC-S1-62

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-62 |
| Story/AC ref | US-01 AC-5 ("consecutive", "temporarily") |
| Test Scenario | A successful login resets the failure count, and the lock is temporary |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Not logged in. Account organiser@example.com has 0 failed attempts and no lock. |
| Test Steps | 1. Fail 5 times, then log in correctly, then check the account.<br>2. (Fresh reset) Fail 15 times so the account locks, and confirm the correct password gets 429.<br>3. Let the lock period pass (the test sets `lockedUntil` to the past), then log in correctly. |
| Test Data | organiser@example.com / wrong-password ×5 or ×15; correct-horse-battery-staple |
| Expected Result | Failures only count while consecutive: a successful login clears the count. The lock is temporary: once it has elapsed, the correct password logs in again. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The AC doesn't state how long the lock lasts. The code locks for 30 minutes, and the expiry is simulated by moving `lockedUntil` into the past, not by waiting. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/auth.e2e-spec.ts::resets the count after a successful login`<br>Integration: `test/auth.e2e-spec.ts::unlocks once the lock period has elapsed`<br>Unit: `src/auth/auth.service.spec.ts::AuthService (US-01) AC-5: lockout after 15 failures in 30 minutes` |

**US-01 AC ↔ code mismatches**
- **AC-5, fixed versus sliding window (flagged for the team).** The code counts failures in a fixed 30-minute window that starts at the first failure, and the first failure after the window closes restarts the count at 1. If the AC means *any* 15 consecutive failures within 30 minutes (a sliding window), the code can miss a lock. Example: 1 failure at T0, 13 at T0 + 29 min, then 2 at T0 + 30.5 min. Failures 2 to 16 all fall within about 2 minutes, so a sliding window would lock. The code restarts the count at T0 + 30.5 min and ends at 2, with no lock. TC-S1-61 passes under either reading, because its failures span more than 30 minutes. The team should confirm with the customer which reading is intended. The code is unchanged.
- **AC-5, the 15th attempt.** The 15th failure returns the generic 401 and sets the lock. The helpline message (429) appears from the 16th attempt. This matches "further attempts", but a reader expecting the 15th response itself to name the helpline would see it one attempt later.
- **AC-5, lock duration.** The AC says "temporarily" without a duration. The code uses 30 minutes (TC-S1-62).

---

## US-02 Role-appropriate access restriction (all roles)

### TC-S1-67

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-67 |
| Story/AC ref | US-02 AC-1 |
| Test Scenario | An action with no explicit grant is denied, and nothing changes (default-deny) |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql + tc-s1-67-setup.sql on testDB (reset before test). Logged in as each base role in turn. |
| Test Steps | 1. Each role calls `GET /events/EVT-160/internal-notes`, a route that declares no permission.<br>2. Compare the events table before and after.<br>3. Venue Staff call `POST /events/drafts`. |
| Test Data | `EVT-160` "Event owned by A" (CONFIRMED, Organiser USR-006, Coordinator USR-004); `EVT-161` "Event owned by B" (CONFIRMED, Organiser USR-007, Coordinator USR-005); `EVT-162` "Unreviewed draft" (DRAFT, USR-006). Each carries "INTERNAL …" planning notes. |
| Expected Result | Every role gets 403 for the undeclared route and receives none of its content. The data is unchanged. Venue Staff, who have no create grant, get 403 and nothing is saved. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | 403 for every role, no payload, identical rows before and after; Venue Staff's draft was refused and not saved. |
| Status | Pass |
| Remarks | The rule itself (deny unless declared) is checked in the matrix and RolesGuard unit tests. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/access-control.e2e-spec.ts::denies a route that declares no permission, for every role`<br>Integration: `test/access-control.e2e-spec.ts::changes nothing when denied`<br>Integration: `test/access-control.e2e-spec.ts::denies an event action the role has no grant for`<br>Unit: `src/common/access/permission-matrix.spec.ts::Permission matrix (US-02) AC-1: default-deny`<br>Unit: `src/common/guards/roles.guard.spec.ts::RolesGuard (US-02) AC-1: default-deny`<br>Unit: `src/common/access/access-control.service.spec.ts::AccessControlService (US-02) requireScope` |

### TC-S1-68

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-68 |
| Story/AC ref | US-02 AC-2 |
| Test Scenario | A granted action succeeds |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql + tc-s1-67-setup.sql on testDB (reset before test). |
| Test Steps | 1. The Organiser, a Coordinator and an Attendee each call `GET /events`.<br>2. The Organiser saves a draft (`POST /events/drafts`). |
| Test Data | `EVT-160` "Event owned by A" (CONFIRMED, Organiser USR-006, Coordinator USR-004); `EVT-161` "Event owned by B" (CONFIRMED, Organiser USR-007, Coordinator USR-005); `EVT-162` "Unreviewed draft" (DRAFT, USR-006). Each carries "INTERNAL …" planning notes. |
| Expected Result | Each listing succeeds (200). The Organiser's draft is created (201) and saved as their own DRAFT. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | 200 for all three; the draft was saved with organiserId USR-006 and status DRAFT. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/access-control.e2e-spec.ts::lets %s list events`<br>Integration: `test/access-control.e2e-spec.ts::lets an Organiser carry out a granted write (save a draft)`<br>Unit: `src/common/access/permission-matrix.spec.ts::Permission matrix (US-02) AC-2: granted actions are permitted`<br>Unit: `src/common/guards/roles.guard.spec.ts::RolesGuard (US-02) AC-2: granted actions pass` |

### TC-S1-69

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-69 |
| Story/AC ref | US-02 AC-3 |
| Test Scenario | An ungranted action called directly through the API or a URL is rejected by the server, not just hidden in the UI |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql + tc-s1-67-setup.sql on testDB (reset before test). |
| Test Steps | 1. Venue Staff call `PATCH /events/EVT-160` directly.<br>2. Venue Staff call `GET /events/EVT-160`.<br>3. The Organiser calls `GET /events/EVT-161` (another Organiser's event).<br>4. An Attendee calls the undeclared route and the response body is inspected. |
| Test Data | `EVT-160` "Event owned by A" (CONFIRMED, Organiser USR-006, Coordinator USR-004); `EVT-161` "Event owned by B" (CONFIRMED, Organiser USR-007, Coordinator USR-005); `EVT-162` "Unreviewed draft" (DRAFT, USR-006). Each carries "INTERNAL …" planning notes. |
| Expected Result | Each call is refused by the server: 403 for an action the role lacks, 404 for a record outside the user's scope. No event data comes back with a refusal, and the event is unchanged. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | 1: 403, name unchanged. 2 and 3: 404 with no event data. 4: only `statusCode` and `message`. |
| Status | Pass |
| Remarks | 404 rather than 403 for out-of-scope records is by design (existence not revealed). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/access-control.e2e-spec.ts::rejects a direct URL call for an ungranted role`<br>Integration: `test/access-control.e2e-spec.ts::hides an event with no booking from Venue Staff (RELATED scope)`<br>Integration: `test/access-control.e2e-spec.ts::rejects a direct call for another organiser’s event`<br>Integration: `test/access-control.e2e-spec.ts::returns no payload alongside a denial`<br>Unit: `src/common/access/permission-matrix.spec.ts::Permission matrix (US-02) rolesWithPermission keeps @Roles() derived from the matrix` |

### TC-S1-70

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-70 |
| Story/AC ref | US-02 AC-4 (API) |
| Test Scenario | The system tells each role what it may do, from the same table the server enforces |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql + tc-s1-67-setup.sql on testDB (reset before test). |
| Test Steps | 1. An Attendee, the Organiser and Venue Staff each call `GET /auth/me/permissions`.<br>2. Venue Staff list events.<br>3. Call it without a token. |
| Test Data | `EVT-160` "Event owned by A" (CONFIRMED, Organiser USR-006, Coordinator USR-004); `EVT-161` "Event owned by B" (CONFIRMED, Organiser USR-007, Coordinator USR-005); `EVT-162` "Unreviewed draft" (DRAFT, USR-006). Each carries "INTERNAL …" planning notes. |
| Expected Result | Each role gets only its own granted actions (an Attendee may REGISTER, and has nothing on BOOKING). Roles get different lists. The scope reported (Venue Staff: RELATED) matches what the server enforces. Without a token: 401. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | As expected; Venue Staff's reported RELATED scope matched their empty event list. |
| Status | Pass |
| Remarks | Which menus the screen shows is TC-S1-75. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/access-control.e2e-spec.ts::reports an Attendee’s permitted actions`<br>Integration: `test/access-control.e2e-spec.ts::does not advertise actions the role lacks`<br>Integration: `test/access-control.e2e-spec.ts::differs per role`<br>Integration: `test/access-control.e2e-spec.ts::matches what the server actually enforces`<br>Integration: `test/access-control.e2e-spec.ts::requires authentication`<br>Unit: `src/common/access/permission-matrix.spec.ts::Permission matrix (US-02) AC-4: permittedActionsFor drives the UI from the same table` |

### TC-S1-75

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-75 |
| Story/AC ref | US-02 AC-3, AC-4 (UI) |
| Test Scenario | Each role sees only its own menus, and typing another role's page address does not open it |
| Pre-conditions | UI test: the app shell rendered per role (API mocked). Browser test: Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql + tc-s1-67-setup.sql on testDB (reset before test). |
| Test Steps | 1. Sign in as each role and read the side menu.<br>2. As the Organiser, type `/coordinator` in the address bar. |
| Test Data | Menus per role (frontend `NAV_BY_ROLE`) |
| Expected Result | Organiser: "My requests" only. Coordinator: "My events", "Change requests", "My venue requests", "Venues". Venue Staff and Attendee: their own items only. No role sees another role's items. The Organiser typing a Coordinator address is returned to their own home. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | Each role's menu matched exactly; the Organiser was redirected to `/organiser`. |
| Status | Pass |
| Remarks | The menus come from the frontend's own table (`NAV_BY_ROLE`), not yet from `GET /auth/me/permissions` (TC-S1-70). See the US-02 mismatch notes. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | UI: `frontend/src/features/auth/auth-ui.test.tsx::Given a %s, Then the menu shows exactly %j`<br>UI: `frontend/src/features/auth/auth-ui.test.tsx::Given an Organiser, When they open a Coordinator page by URL, Then they are sent back to their own home`<br>E2E: `e2e/us02-role-access.spec.ts::AC-4: each role sees only its own menu`<br>E2E: `e2e/us02-role-access.spec.ts::AC-3: an Organiser who types a Coordinator URL is sent back to their own home` |

### TC-S1-71

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-71 |
| Story/AC ref | US-02 AC-5 |
| Test Scenario | An Organiser sees only their own requests; another Organiser's are denied |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql + tc-s1-67-setup.sql on testDB (reset before test). Logged in as organiser@example.com. |
| Test Steps | 1. List events (`GET /events`) and open "My event requests" in the browser.<br>2. Open EVT-161 by id and by URL (`/organiser/EVT-161`).<br>3. Open EVT-160, their own. |
| Test Data | `EVT-160` "Event owned by A" (CONFIRMED, Organiser USR-006, Coordinator USR-004); `EVT-161` "Event owned by B" (CONFIRMED, Organiser USR-007, Coordinator USR-005); `EVT-162` "Unreviewed draft" (DRAFT, USR-006). Each carries "INTERNAL …" planning notes. |
| Expected Result | The list holds only the Organiser's own requests (EVT-160 and the draft EVT-162), never EVT-161. Opening EVT-161 is denied with no data. Their own request opens. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | Only own requests listed (API and screen); EVT-161 gave 404 and an error on screen; EVT-160 opened. |
| Status | Pass |
| Remarks | See the US-02 mismatch notes: the AC says "their own organisation's requests", and the system has no organisation, so "own" means the Organiser's own. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/access-control.e2e-spec.ts::lists only their own`<br>Integration: `test/access-control.e2e-spec.ts::denies another organiser’s event by id`<br>Integration: `test/access-control.e2e-spec.ts::allows their own event by id`<br>E2E: `e2e/us02-role-access.spec.ts::AC-5: an Organiser sees only their own requests, and another’s cannot be opened by URL`<br>Unit: `src/common/access/access-control.service.spec.ts::AccessControlService (US-02) AC-5: Organiser sees only their own` |

### TC-S1-72

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-72 |
| Story/AC ref | US-02 AC-6 |
| Test Scenario | A Coordinator sees only events assigned to them; others are denied |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql + tc-s1-67-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (USR-004). |
| Test Steps | 1. List events.<br>2. Open EVT-161 (assigned to coord.b).<br>3. Open EVT-162 (no Coordinator). |
| Test Data | `EVT-160` "Event owned by A" (CONFIRMED, Organiser USR-006, Coordinator USR-004); `EVT-161` "Event owned by B" (CONFIRMED, Organiser USR-007, Coordinator USR-005); `EVT-162` "Unreviewed draft" (DRAFT, USR-006). Each carries "INTERNAL …" planning notes. |
| Expected Result | Only EVT-160 is listed. EVT-161 and EVT-162 are denied with no data. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | List was exactly ["Event owned by A"]; both others gave 404. |
| Status | Pass |
| Remarks | 404 by design. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/access-control.e2e-spec.ts::lists only events assigned to them`<br>Integration: `test/access-control.e2e-spec.ts::denies an event assigned to another coordinator`<br>Integration: `test/access-control.e2e-spec.ts::denies an event with no coordinator assigned`<br>Unit: `src/common/access/access-control.service.spec.ts::AccessControlService (US-02) AC-6: Coordinator sees only assigned` |

### TC-S1-73

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-73 |
| Story/AC ref | US-02 AC-7 |
| Test Scenario | An Attendee sees only public, registration-facing information, never internal planning information |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql + tc-s1-67-setup.sql on testDB (reset before test). Logged in as attendee@example.com. |
| Test Steps | 1. Open EVT-160 (`GET /events/EVT-160`).<br>2. List events, through the API and on the "Browse events" screen. |
| Test Data | `EVT-160` "Event owned by A" (CONFIRMED, Organiser USR-006, Coordinator USR-004); `EVT-161` "Event owned by B" (CONFIRMED, Organiser USR-007, Coordinator USR-005); `EVT-162` "Unreviewed draft" (DRAFT, USR-006). Each carries "INTERNAL …" planning notes. |
| Expected Result | The Attendee gets the name and registration details, but none of: layout notes, accessibility notes or requirements, equipment needs, expected attendance, organiser id, or any "INTERNAL" text. The list shows both confirmed, open events and not the draft, with no internal text. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | As expected, in the single view, the list and the browser screen. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/access-control.e2e-spec.ts::omits internal planning fields`<br>Integration: `test/access-control.e2e-spec.ts::keeps what registration needs`<br>Integration: `test/access-control.e2e-spec.ts::hides events that have not passed review`<br>Integration: `test/access-control.e2e-spec.ts::lists confirmed events that are open for registration`<br>Integration: `test/access-control.e2e-spec.ts::strips internal fields from the list view too`<br>E2E: `e2e/us02-role-access.spec.ts::AC-7: an Attendee sees confirmed events but no drafts and no internal planning text`<br>Unit: `src/common/access/access-control.service.spec.ts::AccessControlService (US-02) AC-7: Attendee sees only registration-facing info` |

### TC-S1-74

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-74 |
| Story/AC ref | US-02 AC-8 (API) |
| Test Scenario | An unauthenticated request to a protected resource is denied and pointed at login |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql + tc-s1-67-setup.sql on testDB (reset before test). |
| Test Steps | 1. `GET /events` with no token.<br>2. `GET /events/EVT-160` with no token.<br>3. `GET /events` with a forged token.<br>4. Log out, then reuse the token. |
| Test Data | `EVT-160` "Event owned by A" (CONFIRMED, Organiser USR-006, Coordinator USR-004); `EVT-161` "Event owned by B" (CONFIRMED, Organiser USR-007, Coordinator USR-005); `EVT-162` "Unreviewed draft" (DRAFT, USR-006). Each carries "INTERNAL …" planning notes. |
| Expected Result | Every request is refused with 401 and no event data. The response tells the client where to log in (`loginUrl`, `WWW-Authenticate`). |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | 401 in all four, with loginUrl `/auth/login` and a Bearer challenge. |
| Status | Pass |
| Remarks | The browser redirect to the login page is TC-S1-58. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/access-control.e2e-spec.ts::denies a protected route with no token`<br>Integration: `test/access-control.e2e-spec.ts::denies a single event with no token`<br>Integration: `test/access-control.e2e-spec.ts::denies a forged token`<br>Integration: `test/access-control.e2e-spec.ts::denies once the session has been logged out`<br>Unit: `src/common/guards/roles.guard.spec.ts::RolesGuard (US-02) AC-8: unauthenticated requests` |

**US-02 AC ↔ code mismatches**
- **AC-5, "their own organisation's requests":** the system has no organisation entity; requests belong to the Organiser who raised them, so "own organisation's" is enforced as "own". If one organisation can have several Organisers who should see each other's requests, that is a new feature. Confirm with the team.
- **AC-4, two tables for one rule:** the server's permission matrix drives `GET /auth/me/permissions` (TC-S1-70), but the screen's menus come from the frontend's `NAV_BY_ROLE` (TC-S1-75). They agree today, and both are tested, but nothing forces them to stay in step. The nav file's own comment plans to drive menus from the permissions endpoint.
- **AC-3, 403 versus 404:** an action the role never has gets 403; a record outside the user's scope gets 404 (existence not revealed). Both are server-side refusals, as the AC asks.

---

## US-03 Submit a new event request (Event Organiser)

### TC-S1-23

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-23 |
| Story/AC ref | US-03 AC-1 |
| Test Scenario | Organiser submits a complete, valid request (happy path) |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia fills in every required field and submits (`POST /events`).<br>2. Read the stored request back. |
| Test Data | Name "Freshman Orientation 2030"; purpose "Welcome new students and introduce campus services"; category "Student engagement"; 2030-10-01 09:00–17:00 UTC; attendance 300 |
| Expected Result | The request is submitted and recorded with status "Submitted", against the Organiser who submitted it. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-submit.e2e-spec.ts::returns 201 with status SUBMITTED`<br>Integration: `test/events-submit.e2e-spec.ts::persists the record against the calling organiser`<br>Unit: `src/events/events.service.spec.ts::EventsService (US-03) AC-1: a valid request is recorded as SUBMITTED` |

### TC-S1-30

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-30 |
| Story/AC ref | US-03 AC-1/AC-4, with US-02 AC-5 (permission) |
| Test Scenario | A submitted request belongs only to its Organiser |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql on testDB (reset before test). Logged in as organiser@example.com and other@example.com (Otto Organiser). |
| Test Steps | 1. Olivia submits a request with organiserId set to Otto's id and status APPROVED in the body.<br>2. Olivia submits a normal request, and Otto lists his events.<br>3. Otto opens Olivia's request by id. |
| Test Data | organiserId USR-007, status "APPROVED" in the payload |
| Expected Result | The client can't choose the owner or the status: the request belongs to Olivia and is Submitted. Another Organiser can't see or open it. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Denied = 404 by design (agreed decision): the request's existence is not revealed. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-submit.e2e-spec.ts::ignores a client-supplied organiserId or status`<br>Integration: `test/events-submit.e2e-spec.ts::does not expose it to a different Organiser`<br>Integration: `test/events-submit.e2e-spec.ts::denies another Organiser the record by id` |

### TC-S1-78

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-78 |
| Story/AC ref | US-03 AC-1, US-04 AC-1, with US-02 AC-3/AC-8 (permission) |
| Test Scenario | Only a signed-in Organiser can submit an event request or save a draft |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). |
| Test Steps | 1. A Coordinator and an Attendee each call `POST /events` and `POST /events/drafts`.<br>2. Call both with no token. |
| Test Data | The same payload as TC-S1-23 |
| Expected Result | The other roles get 403 and the unauthenticated calls 401. Nothing is saved. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | 403 and 401 as expected; the events table stayed empty. |
| Status | Pass |
| Remarks | These tests had no test case before the regeneration. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-submit.e2e-spec.ts::refuses a non-Organiser (@Roles enforcement)`<br>Integration: `test/events-submit.e2e-spec.ts::refuses an unauthenticated submission`<br>Integration: `test/events-draft.e2e-spec.ts::refuses a non-Organiser`<br>Integration: `test/events-draft.e2e-spec.ts::refuses an unauthenticated caller` |

### TC-S1-24

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-24 |
| Story/AC ref | US-03 AC-2 (confirmation) |
| Test Scenario | The Organiser receives confirmation of a successful submission |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits a complete request.<br>2. Inspect the response. |
| Test Data | The same payload as TC-S1-23 |
| Expected Result | The Organiser receives confirmation that the request was created, including its reference and status. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The response is the saved request. The on-screen confirmation is TC-S1-76. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-submit.e2e-spec.ts::returns the persisted request as confirmation` |

### TC-S1-25

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-25 |
| Story/AC ref | US-03 AC-2 (visibility), per Week 7 Change 5 |
| Test Scenario | A newly submitted request appears in the Event Coordinator Lead's unassigned queue, and not to Coordinators |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-25-setup.sql on testDB (reset before test). Logged in as organiser@example.com (the Organiser), then as lead@example.com (the Event Coordinator Lead) and as coord.a@example.com (a Coordinator). |
| Test Steps | 1. The Organiser submits a complete request (`POST /events`).<br>2. The Lead opens the unassigned queue (`GET /assignments/queue`).<br>3. The Coordinator lists their events (`GET /events`). |
| Test Data | The same payload as TC-S1-23 |
| Expected Result | The request appears in the Lead's unassigned queue for assignment. Coordinators can't review or edit it until it is assigned to them. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The request is SUBMITTED with no Coordinator. It is the only entry in the Lead's unassigned queue. The Coordinator's list is empty. |
| Status | Pass |
| Remarks | Change 5 is merged. Assigning it from the queue is US-55 (Sprint 3); after that, the assigned Coordinator sees it. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-submit.e2e-spec.ts::puts the new request in the Event Coordinator Lead’s unassigned queue for review`<br>Integration: `test/events-submit.e2e-spec.ts::keeps the request out of every Coordinator’s view until the Lead assigns it`<br>Integration: `test/events-draft.e2e-spec.ts::keeps it out of every Coordinator’s view once submitted, until the Lead assigns it` |

### TC-S1-76

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-76 |
| Story/AC ref | US-03 AC-1, AC-2, AC-3 (UI) |
| Test Scenario | On the request form, a refused submission flags each offending field, and a successful one is confirmed on screen |
| Pre-conditions | UI test: the form rendered with the API mocked. Browser test: Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com. |
| Test Steps | 1. Open "New event request" and click "Submit for review" with the form empty.<br>2. Fill every required field (name, category, purpose, description, start and end date and time, attendance) and submit. |
| Test Data | "Freshman Orientation", Student engagement, the 15th of next month 09:00–17:00, attendance "200 – 499" |
| Expected Result | Step 1: the form says "Please correct the highlighted fields." and shows a message under each missing or invalid field (for example "Please enter an event name."), marking those inputs invalid; nothing is saved. Step 2: the screen confirms "Request submitted for review." and the request appears in "My event requests" as Submitted. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | Step 1: each field's message shown, inputs marked invalid, no row saved. Step 2: the confirmation appeared, the list showed Submitted, and the saved row was SUBMITTED with no Coordinator. |
| Status | Pass |
| Remarks | **Code changed in this regeneration:** the form gave no confirmation after a successful submission (it only returned to the list). It now shows one (`organiser-new-request.tsx`, `toast.success`). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | UI: `frontend/src/pages/organiser-requests.test.tsx::AC-3: Given the API refuses the submission, Then each offending field is flagged with its own message`<br>UI: `frontend/src/pages/organiser-requests.test.tsx::AC-2: Given the submission succeeds, Then the Organiser is told and taken to their requests`<br>E2E: `e2e/us03-us04-event-request.spec.ts::US-03 AC-3: submitting an empty form is blocked and each missing field is flagged`<br>E2E: `e2e/us03-us04-event-request.spec.ts::US-03 AC-1/AC-2: a complete request is submitted, confirmed on screen and listed as Submitted` |

### TC-S1-26

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-26 |
| Story/AC ref | US-03 AC-3 (negative) |
| Test Scenario | Submission with missing or invalid fields is blocked, and each field is flagged |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits with a start date in the past.<br>2. Olivia submits with attendance "three hundred".<br>3. Olivia submits with the end time before the start time.<br>4. Olivia submits with no category.<br>5. Olivia submits with several fields wrong at once.<br>6. Check no request was stored. |
| Test Data | proposedStart 2020-01-01T09:00Z; expectedAttendance "three hundred"; start 17:00 and end 09:00; category omitted |
| Expected Result | Submission is blocked. Each offending field is flagged with a clear message (past date, non-numeric attendance, end before start, missing category), all at once. Nothing is recorded. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Flagging each field on screen is TC-S1-76. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-submit.e2e-spec.ts::rejects a date in the past`<br>Integration: `test/events-submit.e2e-spec.ts::rejects non-numeric attendance`<br>Integration: `test/events-submit.e2e-spec.ts::rejects an end time before the start time, flagging proposedEnd`<br>Integration: `test/events-submit.e2e-spec.ts::rejects a missing category`<br>Integration: `test/events-submit.e2e-spec.ts::flags EVERY offending field at once, not just the first`<br>Integration: `test/events-submit.e2e-spec.ts::persists nothing when validation fails` |

### TC-S1-27

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-27 |
| Story/AC ref | US-03 AC-3 (boundary) |
| Test Scenario | Values at the edge of valid are handled correctly |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). This applies to the integration step; the unit tests need no database and freeze the clock at 2030-06-01T12:00:00.000Z. |
| Test Steps | 1. With the clock frozen, validate one submission per boundary: start 1 ms in the past, at the current instant and 1 ms in the future; end 1 ms before, equal to and 1 ms after the start; attendance −1, 0 and 1; each required text field as "   "; a padded name.<br>2. Over the API, Olivia submits one request with a start 1 minute in the past, an end equal to it, attendance 0 and a name of spaces. |
| Test Data | start = now − 1 ms / now / now + 1 ms; end = start − 1 ms / start / start + 1 ms; attendance −1 / 0 / 1; name, purpose, description, category = "   "; name "  Gala  " |
| Expected Result | Blocked, each flagged on its own field: a start in the past, an end not after the start, attendance 0 or below, and whitespace-only required text. Accepted: a start at or after the current instant, an end after the start, and attendance 1. Padded text is accepted and stored trimmed. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Closes audit G4 (US-03 boundaries). Whitespace-only text is the regression check for gap #1, fixed in 93316fa. "Now" is accepted because the AC blocks a past date, and the current instant is not past. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Unit: `src/events/create-event-request.dto.spec.ts::CreateEventRequestDto boundaries (TC-S1-27, US-03 AC-3)` (15 unit tests)<br>Integration: `test/events-submit.e2e-spec.ts::blocks boundary values and flags each field: start just past, end = start, attendance 0, blank name` |

### TC-S1-28

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-28 |
| Story/AC ref | US-03 AC-4 |
| Test Scenario | After submitting, the Organiser sees every detail accurately with the current status |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits a complete request.<br>2. Olivia opens it (`GET /events/<id>`).<br>3. Olivia lists her requests. |
| Test Data | The same payload as TC-S1-23 |
| Expected Result | All entered details are displayed accurately and the current status is shown. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-submit.e2e-spec.ts::returns each submitted field accurately`<br>Integration: `test/events-submit.e2e-spec.ts::lists it among the organiser’s own requests`<br>Unit: `src/events/events.service.spec.ts::EventsService (US-03) AC-4: viewing a submitted request` |

### TC-S1-29

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-29 |
| Story/AC ref | US-03 AC-5 (+ boundary) |
| Test Scenario | Expected attendance is stored as a positive whole number |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits with attendance 420.<br>2. Olivia submits with attendance "250" (a numeric string).<br>3. Olivia submits with 0, then −5.<br>4. Olivia submits with 12.5. |
| Test Data | 420; "250"; 0; −5; 12.5 |
| Expected Result | Valid attendance is stored as a positive whole number. Zero, negative and fractional values are refused. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The at-boundary value of 1 is not yet tested (see TC-S1-27). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-submit.e2e-spec.ts::round-trips the value as a number`<br>Integration: `test/events-submit.e2e-spec.ts::accepts a numeric string and stores it as a number`<br>Integration: `test/events-submit.e2e-spec.ts::rejects zero and negative attendance (AC-5)`<br>Integration: `test/events-submit.e2e-spec.ts::rejects a fractional attendance`<br>Unit: `src/events/events.service.spec.ts::EventsService (US-03) AC-5: attendance is stored as given` |

**US-03 AC ↔ code mismatches**
- **AC-2 (resolved, Week 7 Change 5 merged):** a new submission goes to the Event Coordinator Lead's unassigned queue, not to every Coordinator (TC-S1-25, now Pass).
- **AC-2 (fixed in this regeneration):** the screen gave no confirmation after submitting; it now shows "Request submitted for review." (TC-S1-76).
- **AC-3 (fixed and tested):** whitespace-only required text used to be accepted (audit gap #1), fixed in 93316fa. The boundaries are tested by TC-S1-27.

---

## US-04 Save an incomplete request as a draft (Event Organiser)

### TC-S1-31

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-31 |
| Story/AC ref | US-04 AC-1 (+ boundary) |
| Test Scenario | Saving an incomplete draft skips full submission validation, but not basic sanity checks |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia saves a draft with no fields.<br>2. Olivia saves a draft with only a name.<br>3. Olivia saves a draft with a start date in the past.<br>4. Olivia saves a draft with attendance "not a number", then one with the end before the start. |
| Test Data | {}; name "Work in progress"; proposedStart 2020-01-01; expectedAttendance "not a number" |
| Expected Result | An incomplete draft saves as a Draft with the empty fields left empty, and a past date is accepted on a draft. Values of the wrong type are still refused. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-draft.e2e-spec.ts::accepts a completely empty draft`<br>Integration: `test/events-draft.e2e-spec.ts::accepts a draft with required fields still empty`<br>Integration: `test/events-draft.e2e-spec.ts::accepts a date in the past, which submission would reject`<br>Integration: `test/events-draft.e2e-spec.ts::still rejects incoherent data`<br>Unit: `src/events/events-draft.service.spec.ts::EventsService drafts (US-04) AC-1: saving an incomplete draft` |

### TC-S1-32

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-32 |
| Story/AC ref | US-04 AC-2 |
| Test Scenario | The Organiser returns later, opens the draft and continues editing |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia saves a draft with a name and purpose.<br>2. Later, she opens it.<br>3. She adds the purpose to a name-only draft (`PATCH`) and reopens it. |
| Test Data | name "Half done", purpose "Partly written"; later purpose "Added on the second visit" |
| Expected Result | The draft opens with what was entered, and the missing fields can be filled in, with earlier values kept. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-draft.e2e-spec.ts::opens the saved draft with what was entered`<br>Integration: `test/events-draft.e2e-spec.ts::fills in the missing fields incrementally`<br>Unit: `src/events/events-draft.service.spec.ts::EventsService drafts (US-04) AC-2: returning to continue editing` |

### TC-S1-33

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-33 |
| Story/AC ref | US-04 AC-3 (data) |
| Test Scenario | In the request list, a draft is marked "Draft" and a submitted request "Submitted" |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia saves one draft and submits one complete request.<br>2. She lists her requests. |
| Test Data | Draft "Still a draft"; submitted "Freshman Orientation 2030" |
| Expected Result | The draft is clearly marked as Draft, distinct from the request submitted for review. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The data half: each request carries its own status. The on-screen badge is TC-S1-34. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-draft.e2e-spec.ts::marks a draft DRAFT and a submitted request SUBMITTED`<br>Integration: `test/events-draft.e2e-spec.ts::keeps drafts out of the Coordinator review queue` |

### TC-S1-34

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-34 |
| Story/AC ref | US-04 AC-3 (UI) |
| Test Scenario | The draft is visually distinguishable from submitted requests |
| Pre-conditions | UI test: the Organiser's list rendered with one DRAFT and one SUBMITTED request (API mocked). Browser test: base-users.sql on testDB (reset before test), logged in as organiser@example.com. |
| Test Steps | 1. Open "My event requests".<br>2. Compare the Status column of the draft and the submitted request.<br>3. (Browser) Save a new draft and look at its row. |
| Test Data | `EVT-004` and `EVT-146` |
| Expected Result | The draft is clearly marked "Draft" and looks different from requests already submitted for review. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The draft's badge reads "Draft" in grey; the submitted request's reads "Submitted" in a different colour. A draft with no name yet is listed as "Untitled draft" with its Draft badge. |
| Status | Pass |
| Remarks | The API half is TC-S1-33. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | UI: `frontend/src/pages/organiser-requests.test.tsx::AC-3: Given a draft and a submitted request, Then the list labels them "Draft" and "Submitted" in different styles`<br>UI: `frontend/src/pages/organiser-requests.test.tsx::AC-3: Given a draft with no name yet, Then it still appears, as "Untitled draft"`<br>E2E: `e2e/us03-us04-event-request.spec.ts::US-04: a half-filled draft is saved, shown as Draft, then completed and submitted` |

### TC-S1-77

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-77 |
| Story/AC ref | US-04 AC-1 to AC-4 (UI) |
| Test Scenario | An Organiser saves a half-filled draft on screen, sees it marked Draft, then returns, completes and submits it |
| Pre-conditions | UI test: the form rendered with the API mocked. Browser test: Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com. |
| Test Steps | 1. On "New event request", enter only a name and click "Save as draft".<br>2. Find it in "My event requests".<br>3. Open it for editing, fill the remaining required fields and click "Submit for review". |
| Test Data | "Half-planned social" |
| Expected Result | Step 1 saves without asking for the other fields and confirms "Draft saved.". Step 2 shows it with a Draft badge. Step 3 shows the name already entered, and submitting moves it to Submitted with the confirmation. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | Saved as DRAFT and confirmed; listed with the Draft badge; reopened with its name; submitted and stored as SUBMITTED. |
| Status | Pass |
| Remarks | Confirmations on saving were added with TC-S1-76's change. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | UI: `frontend/src/pages/organiser-requests.test.tsx::AC-1: Given required fields are empty, When "Save as draft" is chosen, Then it is saved as a draft and confirmed`<br>E2E: `e2e/us03-us04-event-request.spec.ts::US-04: a half-filled draft is saved, shown as Draft, then completed and submitted` |

### TC-S1-35

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-35 |
| Story/AC ref | US-04 AC-4 |
| Test Scenario | Completing a draft and submitting it changes its status from Draft to Submitted |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia saves a complete draft.<br>2. She submits it (`POST /events/<id>/submit`). |
| Test Data | A draft with all required fields |
| Expected Result | The status changes from "draft" to "submitted". |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Visibility to reviewers after submission follows Week 7 Change 5 (see TC-S1-25). `events-draft.e2e-spec.ts::makes it visible to a Coordinator once submitted` asserts the old pool behaviour, so it is not cited. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-draft.e2e-spec.ts::moves DRAFT -> SUBMITTED`<br>Unit: `src/events/events-draft.service.spec.ts::EventsService drafts (US-04) AC-4: completing and submitting a draft` |

### TC-S1-36

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-36 |
| Story/AC ref | US-04 AC-4 (negative) |
| Test Scenario | Submitting a draft that is still incomplete, or whose date has passed, is blocked |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia saves a name-only draft and tries to submit it.<br>2. She saves a complete draft dated in the past and tries to submit it. |
| Test Data | name "Only a name"; proposedStart 2020-01-01 |
| Expected Result | Submission is blocked and each missing or invalid field is flagged. The request stays a Draft. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-draft.e2e-spec.ts::blocks submitting an incomplete draft and flags each missing field`<br>Integration: `test/events-draft.e2e-spec.ts::blocks submitting a draft whose date has since passed` |

### TC-S1-37

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-37 |
| Story/AC ref | US-04 AC-5 (conflict) |
| Test Scenario | A request that has been submitted no longer behaves as an editable draft |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits a request.<br>2. She tries to edit it.<br>3. She checks the stored record.<br>4. She tries to submit it again.<br>5. She opens it. |
| Test Data | Edit name "Changed after submission" |
| Expected Result | The submitted request can't be edited or re-submitted as a draft, and is still shown with its status. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-draft.e2e-spec.ts::refuses to edit it`<br>Integration: `test/events-draft.e2e-spec.ts::leaves the stored record untouched after a refused edit`<br>Integration: `test/events-draft.e2e-spec.ts::refuses to submit it again`<br>Integration: `test/events-draft.e2e-spec.ts::still shows it, with its status`<br>Unit: `src/events/events-draft.service.spec.ts::EventsService drafts (US-04) AC-5: a submitted request is not a draft` |

### TC-S1-38

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-38 |
| Story/AC ref | US-04 AC-2/AC-4, with US-02 AC-5 (permission) |
| Test Scenario | Another Organiser cannot edit or submit someone else's draft |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql on testDB (reset before test). Logged in as organiser@example.com and other@example.com. |
| Test Steps | 1. Olivia saves a draft.<br>2. Otto tries to edit it.<br>3. Otto tries to submit it. |
| Test Data | Draft "Mine"; Otto's edit name "Hijacked" |
| Expected Result | Both attempts are denied and the draft is unchanged. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Denied = 404 by design (agreed decision): the request's existence is not revealed. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-draft.e2e-spec.ts::refuses to edit another Organiser’s draft`<br>Integration: `test/events-draft.e2e-spec.ts::refuses to submit another Organiser’s draft` |

**US-04 AC ↔ code mismatches**
- None in behaviour. AC-3's visual part is now automated (TC-S1-34), and the test that assumed the pre-Change-5 pool now asserts the Lead's queue.

---

## US-05 View current status of my event request (Event Organiser)

### TC-S1-39

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-39 |
| Story/AC ref | US-05 AC-1 |
| Test Scenario | Each of the Organiser's requests displays its current status, for every status |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-39-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia lists her requests (`GET /events/mine`). |
| Test Data | 12 requests named "Request <STATUS>", one per status |
| Expected Result | Each request displays its current status (draft, submitted, under review, approved, rejected, planning, confirmed, completed, cancelled, and the other lifecycle statuses). |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Covers all 14 statuses the system has: the 9 AC-1 lists, plus AWAITING_CLARIFICATION, RETURNED, AWAITING_ARRANGEMENTS, and Week 7 Change 6's AWAITING_SAFETY_CHECK and SAFETY_REJECTED. The badges on screen are TC-S1-80. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-status-view.e2e-spec.ts::reports every status in the lifecycle`<br>Unit: `src/events/events-status-view.service.spec.ts::EventsService status view (US-05) AC-1: every status is reported` |

### TC-S1-40

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-40 |
| Story/AC ref | US-05 AC-1 (boundary) |
| Test Scenario | An Organiser with no requests sees an empty list |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia lists her requests. |
| Test Data | No requests |
| Expected Result | An empty list is shown, not an error. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-status-view.e2e-spec.ts::returns an empty list when the Organiser has none` |

### TC-S1-79

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-79 |
| Story/AC ref | US-05 AC-1, AC-5, with US-02 AC-3/AC-8 (permission) |
| Test Scenario | Only a signed-in Organiser can open the "my requests" status view, and its address is never mistaken for a request id |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). (+ tc-s1-01-setup.sql for the routing check) |
| Test Steps | 1. A Coordinator calls `GET /events/mine`.<br>2. Call it with no token.<br>3. The Organiser calls `GET /events/mine` with a request on file. |
| Test Data | — |
| Expected Result | 1: refused (403). 2: refused (401). 3: the Organiser's list, not a "request not found" error. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | 403, 401, and a 200 list containing EVT-146. |
| Status | Pass |
| Remarks | These three tests had no test case before the regeneration. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-status-view.e2e-spec.ts::refuses a non-Organiser`<br>Integration: `test/events-status-view.e2e-spec.ts::refuses an unauthenticated caller`<br>Integration: `test/events-status-view.e2e-spec.ts::does not treat "mine" as an event id` |

### TC-S1-41

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-41 |
| Story/AC ref | US-05 AC-2 |
| Test Scenario | A rejected request shows the Coordinator's reason |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-41-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia lists her requests.<br>2. Olivia opens `EVT-010`. |
| Test Data | `EVT-011` "Clashes with the examination period"; `EVT-010` "Venue capacity insufficient" |
| Expected Result | The rejected request shows its status and the reason the Coordinator gave, in the list and when opened. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-status-view.e2e-spec.ts::includes decisionReason on a rejected request`<br>Integration: `test/events-status-view.e2e-spec.ts::includes it when opening the request directly`<br>Unit: `src/events/events-status-view.service.spec.ts::EventsService status view (US-05) AC-2: a rejected request shows the reason` |

### TC-S1-42

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-42 |
| Story/AC ref | US-05 AC-3 |
| Test Scenario | When the Coordinator has asked for clarification, the Organiser sees that, and what is asked |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-42-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia lists her requests. |
| Test Data | `EVT-005` "Please confirm the expected attendance figure"; `EVT-007` "Which venue did you have in mind?"; `EVT-006` no question |
| Expected Result | Requests awaiting clarification show that clarification is needed and the question asked. A plain draft shows no clarification. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-status-view.e2e-spec.ts::flags clarification and shows what is asked`<br>Integration: `test/events-status-view.e2e-spec.ts::distinguishes a returned request from an ordinary draft`<br>Unit: `src/events/events-status-view.service.spec.ts::EventsService status view (US-05) AC-3: clarification is visible, with the question asked` |

### TC-S1-43

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-43 |
| Story/AC ref | US-05 AC-3 (negative) |
| Test Scenario | No clarification is shown when none was asked |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia lists her requests. |
| Test Data | `EVT-146` with no question |
| Expected Result | The request shows no clarification flag and no question. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-status-view.e2e-spec.ts::reports no clarification when none was asked` |

### TC-S1-80

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-80 |
| Story/AC ref | US-05 AC-1, AC-2, AC-3 (UI) |
| Test Scenario | On screen, the Organiser sees each request's status, the reason for a rejection, and that clarification is needed with the question asked |
| Pre-conditions | UI test: the Organiser's list rendered with the API mocked. Browser test: Run test/fixtures/sql/base-users.sql on testDB (reset before test). + tc-s1-01-setup.sql; the assigned Coordinator (coord.a) asks a question, then the Organiser signs in. |
| Test Steps | 1. Open "My event requests" with requests under review, approved, cancelled and rejected.<br>2. (Browser) The Coordinator asks "How many speakers will there be?"; the Organiser opens their list and the request. |
| Test Data | Rejected reason "Clashes with exams" |
| Expected Result | Each row's badge shows its own status. A rejected row shows the Coordinator's reason. After the question, the list shows "Awaiting clarification" and the request page shows the question. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | As expected in both the UI test and the browser. |
| Status | Pass |
| Remarks | The rejection reason after a real Reject is also shown in TC-S1-83. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | UI: `frontend/src/pages/organiser-status-layout.test.tsx::AC-1: Given requests in several states, Then each row shows its own status`<br>UI: `frontend/src/pages/organiser-status-layout.test.tsx::AC-2: Given a rejected request, Then its row shows the Coordinator’s reason`<br>E2E: `e2e/us05-us08-review.spec.ts::US-05: after the Coordinator asks a question, the Organiser sees clarification is needed and what is asked` |

### TC-S1-44

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-44 |
| Story/AC ref | US-05 AC-4 |
| Test Scenario | After a status change, the next view shows the most recent valid state |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. The Organiser saves a complete draft and lists their requests.<br>2. They submit it through the real submit endpoint and list again.<br>3. (Second test) On a submitted request, the assigned Coordinator asks a question and the Organiser answers it; the Organiser lists again. |
| Test Data | A complete draft |
| Expected Result | The displayed status reflects the latest valid state: Draft, then Submitted; and Under review once the question is answered. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Draft → Submitted → Under review, each shown on the next read. |
| Status | Pass |
| Remarks | The AC's example (submitted → under review) is now reached through the only real action that sets it, answering a clarification. The test used to write the status directly. See the US-05 notes. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-status-view.e2e-spec.ts::reflects a transition made through the real submit endpoint`<br>Integration: `test/events-status-view.e2e-spec.ts::reflects a later submitted -> under review change`<br>Unit: `src/events/events-status-view.service.spec.ts::EventsService status view (US-05) AC-4: the most recent state is what is shown` |

### TC-S1-45

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-45 |
| Story/AC ref | US-05 AC-4 (boundary) |
| Test Scenario | A repeated read after a change does not serve a stale, cached status |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-45-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia lists her requests (`EVT-002` is APPROVED).<br>2. The request moves to PLANNING.<br>3. Olivia lists her requests again. |
| Test Data | `EVT-002` APPROVED → PLANNING |
| Expected Result | The second read shows the new status, not the earlier one. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The status change is applied directly to the record, standing in for the planning story's action. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-status-view.e2e-spec.ts::does not serve a stale status on a repeated read` |

### TC-S1-46

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-46 |
| Story/AC ref | US-05 AC-5 (permission) |
| Test Scenario | Requests belonging to another Organiser never appear, and can't be opened |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-22-setup.sql + tc-s1-46-setup.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia lists her requests.<br>2. Olivia opens Otto's request `EVT-148` by id.<br>3. Olivia lists again and opens Otto's rejected request `EVT-149`. |
| Test Data | `EVT-008` (Olivia); `EVT-148` and `EVT-149` "CONFIDENTIAL internal note" (Otto) |
| Expected Result | Only Olivia's own request appears. Otto's requests and their reasons are never shown. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Denied = 404 by design (agreed decision): the request's existence is not revealed. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-status-view.e2e-spec.ts::excludes them from the list`<br>Integration: `test/events-status-view.e2e-spec.ts::denies fetching another Organiser’s request by id`<br>Integration: `test/events-status-view.e2e-spec.ts::does not leak a rejection reason belonging to someone else`<br>Unit: `src/events/events-status-view.service.spec.ts::EventsService status view (US-05) AC-5: only the Organiser’s own requests` |

**US-05 AC ↔ code mismatches**
- **AC-4, what moves a request to Under review (open question for the team):** the AC's example is "submitted → under review", but no Coordinator action does that on first look. Only answering a clarification does (AWAITING_CLARIFICATION → UNDER_REVIEW). TC-S1-44 now uses that real path rather than writing the status directly. Is a "start review" step intended?
- **AC-1:** the AC lists 9 statuses; the system has 14 (adds Awaiting clarification, Returned, Awaiting arrangements, and Change 6's Awaiting safety check and Safety rejected). All 14 are shown and tested (TC-S1-39).

---

## US-06 Specify preferred room layout and accessibility requirements (Event Organiser)

### TC-S1-47

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-47 |
| Story/AC ref | US-06 AC-1 |
| Test Scenario | The Organiser selects a preferred layout from the predefined list |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits a request with each listed layout in turn. |
| Test Data | THEATRE, CLASSROOM, BANQUET, BOARDROOM |
| Expected Result | Each predefined layout can be selected and is saved with the request. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-layout.e2e-spec.ts::accepts %s`<br>Unit: `src/events/events-layout.service.spec.ts::EventsService layout & accessibility (US-06) AC-1 / AC-2: layout selection and notes` |

### TC-S1-48

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-48 |
| Story/AC ref | US-06 AC-1 (negative) |
| Test Scenario | A layout outside the predefined list is refused |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits with layout "CABARET".<br>2. She submits with a free-text layout. |
| Test Data | "CABARET"; "theatre style-ish" |
| Expected Result | The value is refused and the valid options are named. Free text belongs in the notes, not the layout field. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-layout.e2e-spec.ts::rejects a layout outside the list and names the valid options`<br>Integration: `test/events-layout.e2e-spec.ts::rejects a free-text layout, which belongs in layoutNotes` |

### TC-S1-49

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-49 |
| Story/AC ref | US-06 AC-2 |
| Test Scenario | Optional free-text layout notes alongside, or instead of, a selection |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits with layout THEATRE and a note.<br>2. She submits with a note and no layout. |
| Test Data | "…centre aisle…"; "Cabaret, eight to a table" |
| Expected Result | The notes are saved alongside the selection, or on their own when no listed layout fits. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-layout.e2e-spec.ts::stores notes with a selection`<br>Integration: `test/events-layout.e2e-spec.ts::stores notes with no selection, for a layout not on the list` |

### TC-S1-50

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-50 |
| Story/AC ref | US-06 AC-3 |
| Test Scenario | The Organiser records accessibility requirements, with optional notes |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits with several requirements.<br>2. She submits with a requirement and notes.<br>3. She submits with the newer list entries.<br>4. She submits with notes only. |
| Test Data | e.g. STEP_FREE_ACCESS, HEARING_LOOP; ACCESSIBLE_RESTROOMS + "…same floor…"; notes "Quiet room…" |
| Expected Result | Accessibility requirements and notes are recorded as entered. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Picking several requirements on screen is TC-S1-81. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-layout.e2e-spec.ts::records multiple requirements`<br>Integration: `test/events-layout.e2e-spec.ts::records requirements with notes`<br>Integration: `test/events-layout.e2e-spec.ts::accepts the newer features added to the list`<br>Integration: `test/events-layout.e2e-spec.ts::accepts notes with no structured requirement selected`<br>Unit: `src/events/events-layout.service.spec.ts::EventsService layout & accessibility (US-06) AC-3: accessibility requirements` |

### TC-S1-51

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-51 |
| Story/AC ref | US-06 AC-3 (negative) |
| Test Scenario | Unknown or repeated accessibility requirements are refused |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits with an unknown requirement.<br>2. She submits with a requirement listed twice. |
| Test Data | ["STEP_FREE_ACCESS", "TELEPORTER"]; a duplicated entry |
| Expected Result | The request is refused, with a message naming the allowed requirements. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-layout.e2e-spec.ts::rejects an unrecognised requirement`<br>Integration: `test/events-layout.e2e-spec.ts::rejects duplicates` |

### TC-S1-81

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-81 |
| Story/AC ref | US-06 AC-1 to AC-6 (UI) |
| Test Scenario | On the form, the Organiser picks a layout from the list, adds notes and any number of accessibility requirements; they survive reopening and the assigned Coordinator sees them |
| Pre-conditions | UI test: the form rendered with the API mocked. Browser tests: Run test/fixtures/sql/base-users.sql on testDB (reset before test). (and tc-s1-54-setup.sql for the Coordinator's view). |
| Test Steps | 1. Open the layout list.<br>2. Choose Theatre with notes, select Step-free access and Hearing loop, add notes and save a draft.<br>3. Reopen the draft for editing.<br>4. Save a request with no layout or accessibility.<br>5. (Browser) The assigned Coordinator opens EVT-153. |
| Test Data | Layout Theatre or Banquet; requirements Step-free access + Hearing loop |
| Expected Result | 1: the list includes Theatre, Classroom, Banquet and Boardroom. 2: all values are saved together, both requirements included. 3: both requirements are still selected. 4: it saves. 5: the Coordinator sees the layout, notes and each requirement, in the same wording. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | As expected. Before the fix, step 2 could hold only one requirement and step 3 dropped the second. |
| Status | Pass |
| Remarks | **Code changed in this regeneration:** the form's accessibility field was a single dropdown and reopening a request kept only its first requirement, so saving silently dropped the rest. It is now a multi-choice group (like Required facilities) and keeps the whole list. The Coordinator's page now uses the same labels as the form ("Step-free access", not "Step free access"). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | UI: `frontend/src/pages/organiser-status-layout.test.tsx::AC-1: Then the layout is chosen from a predefined list including theatre, classroom, banquet and boardroom`<br>UI: `frontend/src/pages/organiser-status-layout.test.tsx::AC-2/AC-3: Given a layout with notes and two accessibility requirements, Then all are saved together`<br>UI: `frontend/src/pages/organiser-status-layout.test.tsx::AC-4: Given a saved request with two requirements, When it is reopened and saved, Then both are kept`<br>UI: `frontend/src/pages/organiser-status-layout.test.tsx::AC-5: Given layout and accessibility left empty, Then the payload carries no layout and no requirements`<br>E2E: `e2e/us05-us08-review.spec.ts::US-06: an Organiser picks a layout and two accessibility needs, and both are still selected when the draft is reopened`<br>E2E: `e2e/us05-us08-review.spec.ts::US-06: the assigned Coordinator sees the layout and accessibility the Organiser entered` |

### TC-S1-52

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-52 |
| Story/AC ref | US-06 AC-4 |
| Test Scenario | Layout and accessibility values persist on a draft and after submission, and when reopened |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia saves a draft with layout and accessibility, then reopens it.<br>2. She submits the draft and reopens it.<br>3. She changes the layout on a draft and reopens it. |
| Test Data | THEATRE + requirements + notes; then BOARDROOM |
| Expected Result | The values persist with the request and are visible on reopening, whether saved as a draft or submitted. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-layout.e2e-spec.ts::persists on a draft and is there when reopened`<br>Integration: `test/events-layout.e2e-spec.ts::survives the draft being submitted`<br>Integration: `test/events-layout.e2e-spec.ts::can be edited on a draft before submission`<br>Unit: `src/events/events-layout.service.spec.ts::EventsService layout & accessibility (US-06) AC-4: values persist on a draft too` |

### TC-S1-53

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-53 |
| Story/AC ref | US-06 AC-5 |
| Test Scenario | Leaving layout and accessibility empty does not block saving or submission |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). Logged in as organiser@example.com (Olivia Organiser). |
| Test Steps | 1. Olivia submits a complete request with neither set.<br>2. She saves an empty draft.<br>3. She submits a completed draft without them. |
| Test Data | No layout or accessibility fields |
| Expected Result | The request still saves and submits. These are preferences, not blockers. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-layout.e2e-spec.ts::submits a request with neither recorded`<br>Integration: `test/events-layout.e2e-spec.ts::saves an empty draft with neither recorded`<br>Integration: `test/events-layout.e2e-spec.ts::submits a completed draft that omits them`<br>Unit: `src/events/events-layout.service.spec.ts::EventsService layout & accessibility (US-06) AC-5: these are preferences, not blockers` |

### TC-S1-54

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-54 |
| Story/AC ref | US-06 AC-6 |
| Test Scenario | The assigned Coordinator opens the submitted request and sees the layout and accessibility values |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-54-setup.sql on testDB (reset before test). Request `EVT-153` is SUBMITTED, assigned to coord.a@example.com, with layout THEATRE and accessibility STEP_FREE_ACCESS and HEARING_LOOP. Logged in as coord.a@example.com (the assigned Coordinator), then as attendee@example.com. |
| Test Steps | 1. The Coordinator lists their requests (`GET /events`).<br>2. The Coordinator opens EVT-153 (`GET /events/EVT-153`, and the review page in the browser).<br>3. An Attendee lists events and tries to open EVT-153. |
| Test Data | THEATRE; STEP_FREE_ACCESS, HEARING_LOOP; notes "Ramp access to the stage" |
| Expected Result | The layout and accessibility values the Organiser entered are visible to the reviewing Coordinator, in the list and when opened. An Attendee never sees them. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Both API reads and the review page showed Theatre, the layout notes, Step-free access, Hearing loop and the accessibility notes. The Attendee got no row and a 404. |
| Status | Pass |
| Remarks | Change 5 is merged, so the tests now load tc-s1-54-setup.sql (a request already assigned to this Coordinator) instead of reading the old shared pool. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-layout.e2e-spec.ts::shows layout and accessibility in the Coordinator’s list of assigned requests`<br>Integration: `test/events-layout.e2e-spec.ts::shows them when the Coordinator opens the request`<br>Integration: `test/events-layout.e2e-spec.ts::still hides them from an Attendee — they are internal planning`<br>E2E: `e2e/us05-us08-review.spec.ts::US-06: the assigned Coordinator sees the layout and accessibility the Organiser entered` |

**US-06 AC ↔ code mismatches**
- **AC-3 (fixed in this regeneration):** the API accepted several accessibility requirements, but the form offered one dropdown and, on reopening a request, kept only the first, so saving dropped the others. The form now lets the Organiser choose any number and keeps them all (TC-S1-81).
- **AC-6 (resolved, Change 5 merged):** the Coordinator who sees the preferences is the one assigned to the request (TC-S1-54 now Pass). The review page now shows accessibility needs in the form's wording.

---

## US-07 Review submitted request for clarity/completeness (Event Coordinator)

### TC-S1-02

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-02 |
| Story/AC ref | US-07 AC-1 |
| Test Scenario | Coordinator views a request and sees its current status, for each status the AC lists |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-02-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. Requests `EVT-004`, `EVT-146`, `EVT-151`, `EVT-001`, `EVT-012` and `EVT-009` are all assigned to Cody. |
| Test Steps | 1. Cody opens each request in turn (`GET /events/assigned/<id>`).<br>2. Note the status shown. For the returned request, also note the outstanding question. |
| Test Data | DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, RETURNED ("Please confirm the attendance figure"), REJECTED |
| Expected Result | Each request displays its current status: draft, submitted, under review, approved, returned, rejected. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-review.e2e-spec.ts::shows %s` (DRAFT, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED)<br>Integration: `test/events-review.e2e-spec.ts::shows a returned request with its outstanding question`<br>Integration: `test/events-review.e2e-spec.ts::does not mark an ordinary draft as returned`<br>Unit: `src/events/events-review.service.spec.ts::EventsService review (US-07) AC-1: current status is reported` |

### TC-S1-03

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-03 |
| Story/AC ref | US-07 AC-2 |
| Test Scenario | Coordinator opens a submitted request and sees all its details |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody opens request `EVT-146` (`GET /events/assigned/EVT-146`). |
| Test Data | Name "Freshman Orientation 2030"; purpose "Welcome new students"; description "Full-day programme with talks and booths"; 2030-10-01 09:00–17:00 UTC |
| Expected Result | All details are displayed: name, purpose, description, and proposed date and time, exactly as entered. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-review.e2e-spec.ts::returns name, purpose, description and proposed date & time`<br>Unit: `src/events/events-review.service.spec.ts::EventsService review (US-07) AC-2: all details are shown` |

### TC-S1-01

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-01 |
| Story/AC ref | US-07 AC-3 |
| Test Scenario | Coordinator approves a submitted request that is ready to proceed (happy path) |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com (Cody Coordinator). Request `EVT-146` is SUBMITTED and assigned to Cody. |
| Test Steps | 1. Cody clicks "Approve" on request `EVT-146` (`POST /events/EVT-146/approve`).<br>2. Read the request back.<br>3. Log in as organiser@example.com and open "My requests". |
| Test Data | Request `EVT-146` ("Freshman Orientation 2030") |
| Expected Result | The request status updates to "Approved". The Organiser sees it as Approved. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The request is assigned to this Coordinator, as Week 7 Change 5 requires before a review. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-review.e2e-spec.ts::moves a submitted request to APPROVED`<br>Integration: `test/events-review.e2e-spec.ts::is visible to the Organiser afterwards`<br>Integration: `test/events-review.e2e-spec.ts::approves from UNDER_REVIEW`<br>Integration: `test/events-review.e2e-spec.ts::clears a stale clarification and rejection reason`<br>Unit: `src/events/events-review.service.spec.ts::EventsService review (US-07) AC-3: approving moves the request to APPROVED` |

### TC-S1-04

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-04 |
| Story/AC ref | US-07 AC-3 (negative) |
| Test Scenario | Approve is refused for a request that is not ready to proceed (a draft, or a cancelled request) |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-02-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody clicks "Approve" on `EVT-004`.<br>2. Cody clicks "Approve" on `EVT-003`.<br>3. Read `EVT-004` back. |
| Test Data | `EVT-004` (DRAFT), `EVT-003` (CANCELLED) |
| Expected Result | Approval is refused for both, and the draft stays a draft. Only a submitted request can be approved. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Conflict case: an illegal status transition. The request is assigned to this Coordinator, as Week 7 Change 5 requires before a review. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-review.e2e-spec.ts::refuses to approve a DRAFT`<br>Integration: `test/events-review.e2e-spec.ts::refuses to approve a CANCELLED request` |

### TC-S1-05

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-05 |
| Story/AC ref | US-07 AC-3 (boundary) |
| Test Scenario | Clicking "Approve" twice on the same request |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody clicks "Approve" on `EVT-146`.<br>2. Cody clicks "Approve" on it again.<br>3. Read the request back. |
| Test Data | Request `EVT-146` |
| Expected Result | The request is Approved. The second click neither errors nor changes the status. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | The request is assigned to this Coordinator, as Week 7 Change 5 requires before a review. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-review.e2e-spec.ts::is idempotent — approving twice leaves it APPROVED` |

### TC-S1-06

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-06 |
| Story/AC ref | US-07 AC-3, with US-02 AC-3/AC-6 (permission) |
| Test Scenario | Only the Coordinator assigned to the request can approve it |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). `EVT-146` is assigned to Cody (coord.a@example.com). Logged in in turn as coord.b@example.com (Casey Coordinator), organiser@example.com and attendee@example.com. |
| Test Steps | 1. Casey (not assigned) calls Approve on `EVT-146` directly.<br>2. The Organiser calls Approve.<br>3. The Attendee calls Approve.<br>4. Read the request back after each attempt. |
| Test Data | Request `EVT-146` |
| Expected Result | Every attempt is denied, and the request stays Submitted. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Denied = 404 by design: a peer Coordinator gets 404 rather than 403, so the request's existence is not revealed. A request nobody has been assigned is refused too, and once the Lead assigns it (through the real `/assignments` endpoint) its Coordinator can approve it. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-review.e2e-spec.ts::refuses a Coordinator assigned to a different event`<br>Integration: `test/events-review.e2e-spec.ts::refuses %s at the role gate` (organiser, attendee)<br>Integration: `test/events-review.e2e-spec.ts::refuses to approve an unassigned request from the pool`<br>Integration: `test/events-review.e2e-spec.ts::approves once that request has been assigned`<br>Integration: `test/events-review.e2e-spec.ts::refuses an unauthenticated caller`<br>Unit: `src/events/events-review.service.spec.ts::EventsService review (US-07) assignment ownership` |

### TC-S1-07

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-07 |
| Story/AC ref | US-07 AC-3 with US-08 AC-3 (conflict) |
| Test Scenario | Approve and Reject are submitted for the same request at the same moment |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test, and again before each of the 20 iterations). Logged in as coord.a@example.com. Request `EVT-146` is SUBMITTED and assigned to Cody. |
| Test Steps | 1. Reset the testDB and load the pre-condition scripts.<br>2. Send "Approve" and "Reject" (reason "Clashes with the examination period") for `EVT-146` at the same moment (`Promise.all`).<br>3. Read the stored status.<br>4. Repeat steps 1–3 for 20 iterations. |
| Test Data | Request `EVT-146`; reject reason "Clashes with the examination period"; 20 iterations |
| Expected Result | Exactly one decision succeeds and the other is refused with 409 Conflict. The final status, and the stored reason, match the decision that succeeded. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Bug found by test audit; fixed (gap #2) in `61401ec`. Each decision now row-locks the request at the start of its transaction, and only while it still holds the status that was read, so the loser gets 409 and its writes roll back. Approval requires an assigned Coordinator, consistent with Week 7 Change 5. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-review.e2e-spec.ts::lets exactly one of a simultaneous approve and reject succeed, and stores that outcome` |

### TC-S1-82

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-82 |
| Story/AC ref | US-07 AC-1, AC-2, AC-3 (UI), with US-05 AC-4 |
| Test Scenario | On the review page, the assigned Coordinator sees the request's status and details, approves it, and the Organiser then sees Approved |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). + tc-s1-01-setup.sql. Logged in as coord.a@example.com (the assigned Coordinator), then as organiser@example.com. |
| Test Steps | 1. Open the request EVT-146 for review.<br>2. Choose "Approve" and submit the decision.<br>3. The Organiser opens "My event requests". |
| Test Data | EVT-146 "Freshman Orientation 2030" |
| Expected Result | The page shows the status (Submitted), name, purpose and description. After approving, it shows Approved, and so does the Organiser's list. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | As expected; the stored status is APPROVED. |
| Status | Pass |
| Remarks | None. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | E2E: `e2e/us05-us08-review.spec.ts::US-07: the assigned Coordinator sees the status and details, approves, and the Organiser sees Approved` |

**US-07 AC ↔ code mismatches**
- **AC-3 (Week 7 Change 5):** approving requires the request to be assigned to this Coordinator. An unassigned request, or one assigned to someone else, is refused with 404 (not revealed), and the Lead assigns requests from the unassigned queue (US-55).
- **Permission (TC-S1-06), a decision rather than a mismatch:** a Coordinator who isn't assigned gets 404 rather than 403, so the request's existence isn't revealed.

---

## US-08 Reject or return a request with a reason (Event Coordinator)

### TC-S1-08

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-08 |
| Story/AC ref | US-08 AC-1, AC-3 |
| Test Scenario | Reject and Return are separate actions with different outcomes (happy path) |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-02-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. `EVT-146` and `EVT-147` are SUBMITTED and assigned to Cody. |
| Test Steps | 1. Cody chooses "Reject" on `EVT-146` with a reason.<br>2. Cody chooses "Return" on `EVT-147` with a reason.<br>3. Compare the two outcomes. |
| Test Data | Reject reason "Clashes with the examination period"; return reason "Please confirm the attendance figure" |
| Expected Result | The rejected request becomes "Rejected" and the returned one "Returned". The two actions are distinct. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-decision.e2e-spec.ts::reject and return are different endpoints with different outcomes`<br>Integration: `test/events-decision.e2e-spec.ts::returning does leave the request amendable`<br>Integration: `test/events-decision.e2e-spec.ts::reject sets REJECTED`<br>Integration: `test/events-decision.e2e-spec.ts::return sets RETURNED`<br>Integration: `test/events-decision.e2e-spec.ts::both work from UNDER_REVIEW`<br>Integration: `test/events-decision.e2e-spec.ts::refuses to reject a DRAFT`<br>Integration: `test/events-decision.e2e-spec.ts::returns, is amended, resubmitted and then approved`<br>Unit: `src/events/events-decision.service.spec.ts::EventsService reject / return (US-08) AC-1 / AC-3: the two actions are distinct`<br>Unit: `src/events/events-decision.service.spec.ts::EventsService reject / return (US-08) AC-3: status changes go through setStatus` |

### TC-S1-13

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-13 |
| Story/AC ref | US-08 AC-1 (conflict) |
| Test Scenario | A rejected request cannot then be returned or amended |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com and organiser@example.com. |
| Test Steps | 1. Cody rejects `EVT-146`.<br>2. Cody then tries "Return" on it.<br>3. Separately, after a rejection, the Organiser tries to edit the request. |
| Test Data | Reject reason "No"; return reason "Changed my mind"; edit purpose "Trying to edit" |
| Expected Result | The Return is refused and the request stays Rejected. The Organiser cannot amend a rejected request. Each option is a separate, final action. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-decision.e2e-spec.ts::a rejected request cannot then be returned`<br>Integration: `test/events-decision.e2e-spec.ts::rejecting does not leave the request amendable` |

### TC-S1-09

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-09 |
| Story/AC ref | US-08 AC-2 (negative) |
| Test Scenario | Confirming Reject or Return without entering a reason |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody confirms "Reject" on `EVT-146` with no reason field.<br>2. Cody confirms "Return" on `EVT-146` with no reason field.<br>3. Read the request back. |
| Test Data | Request body `{}` |
| Expected Result | Confirmation is prevented until a reason is entered. The request stays Submitted and no reason is saved. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | On screen, the confirm button stays disabled until a reason is typed (TC-S1-83). |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-decision.e2e-spec.ts::%s is blocked when the reason is missing` (reject, return)<br>Integration: `test/events-decision.e2e-spec.ts::nothing is written when the reason is missing` |

### TC-S1-10

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-10 |
| Story/AC ref | US-08 AC-2 (boundary) |
| Test Scenario | The reason is present but empty |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody confirms "Reject" with an empty reason.<br>2. Cody confirms "Return" with an empty reason.<br>3. Read the request back. |
| Test Data | reason `""` |
| Expected Result | Confirmation is prevented. An empty reason is not a reason. The request stays Submitted. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | — |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-decision.e2e-spec.ts::%s is blocked when the reason is an empty string` (reject, return) |

### TC-S1-11

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-11 |
| Story/AC ref | US-08 AC-2 (boundary) |
| Test Scenario | The reason contains only spaces |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody confirms "Reject" with a reason of three spaces.<br>2. Cody confirms "Return" with a reason of three spaces.<br>3. Read the request back. |
| Test Data | reason `"   "` |
| Expected Result | Confirmation is prevented, because no reason has been entered. The request stays Submitted, with no reason saved. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Bug found by test audit; fixed (gap #1). Fixed in 93316fa. This test is now the regression test. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-decision.e2e-spec.ts::%s is blocked when the reason is whitespace-only` (reject, return) |

### TC-S1-12

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-12 |
| Story/AC ref | US-08 AC-4 |
| Test Scenario | The decision and its reason are saved and retained with the request |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com, then as organiser@example.com. |
| Test Steps | 1. Cody rejects `EVT-146` with a reason.<br>2. The Organiser opens "My requests", then opens the request twice.<br>3. Repeat with "Return" and a different reason, then open the request as the Organiser. |
| Test Data | Reject reasons "Clashes with the examination period" and "Venue capacity insufficient"; return reason "Please confirm the attendance figure" |
| Expected Result | The decision (Rejected or Returned) and its reason are saved with the request, and stay visible on every later view. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Three separate tests, each starting from a fresh reset. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-decision.e2e-spec.ts::shows the rejection reason in the Organiser’s view (US-05 AC-2)`<br>Integration: `test/events-decision.e2e-spec.ts::retains the reason across later reads`<br>Integration: `test/events-decision.e2e-spec.ts::shows the return reason as an outstanding clarification (US-05 AC-3)`<br>Integration: `test/events-decision.e2e-spec.ts::a rejection clears an earlier clarification`<br>Unit: `src/events/events-decision.service.spec.ts::EventsService reject / return (US-08) AC-4: the reason is retained` |

### TC-S1-14

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-14 |
| Story/AC ref | US-08 AC-1, with US-02 AC-3/AC-6 (permission) |
| Test Scenario | Only the assigned Coordinator can reject or return the request |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). `EVT-146` is assigned to Cody. Logged in in turn as coord.b@example.com, organiser@example.com and attendee@example.com. |
| Test Steps | 1. Casey (not assigned) tries "Reject", then "Return", on `EVT-146`.<br>2. The Organiser and the Attendee each try "Reject". |
| Test Data | Reasons "Not mine to decide" and "Trying it on" |
| Expected Result | Every attempt is denied, and the request is unchanged. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Matched the Expected Result: every listed automated test passed on 2026-10-26. |
| Status | Pass |
| Remarks | Denied = 404 by design (agreed decision), as in TC-S1-06. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | Integration: `test/events-decision.e2e-spec.ts::%s refuses a Coordinator assigned elsewhere` (reject, return)<br>Integration: `test/events-decision.e2e-spec.ts::refuses %s at the role gate` (organiser, attendee)<br>Integration: `test/events-decision.e2e-spec.ts::refuses to decide an unassigned request from the pool`<br>Integration: `test/events-decision.e2e-spec.ts::refuses an unauthenticated caller`<br>Unit: `src/events/events-decision.service.spec.ts::EventsService reject / return (US-08) assignment ownership` |

### TC-S1-83

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-83 |
| Story/AC ref | US-08 AC-1 to AC-4 (UI), with US-05 AC-2 |
| Test Scenario | On the review page, Reject and Return are separate choices; neither can be confirmed without a reason, and the Organiser sees the outcome and why |
| Pre-conditions | Run test/fixtures/sql/base-users.sql on testDB (reset before test). + tc-s1-01-setup.sql. Logged in as coord.a@example.com, then as organiser@example.com. |
| Test Steps | 1. Choose "Reject" and try to submit with no reason; then enter "Clashes with the exam period" and submit.<br>2. (Fresh request) Choose "Return for changes" with "Please add the programme" and submit.<br>3. The Organiser opens the request each time. |
| Test Data | EVT-146 |
| Expected Result | The submit button stays disabled until a reason is entered. Reject stores Rejected and the Organiser sees "Rejected: <reason>". Return stores Returned, the Organiser sees the reason and can edit and resubmit. |
| Created By | Marilyn Ong |
| Date of Creation | 2026-10-26 |
| **Test execution record** | |
| Actual Result | As expected for both. |
| Status | Pass |
| Remarks | The API refusal of a missing reason is TC-S1-09 to 11. |
| Executed By | Marilyn Ong (automated) |
| Date of Execution | 2026-10-26 |
| Automated by | E2E: `e2e/us05-us08-review.spec.ts::US-08: Reject needs a reason before it can be confirmed, and the Organiser then sees the reason`<br>E2E: `e2e/us05-us08-review.spec.ts::US-08: Return for changes is a separate action; the Organiser sees why and can amend the request` |

**US-08 AC ↔ code mismatches**
- **AC-2 (fixed):** a whitespace-only reason used to be accepted (audit gap #1). Fixed in 93316fa, and TC-S1-11 is now its regression test.
- **AC-4, a note only:** a return's reason is stored as the outstanding clarification (`clarificationRequest`), while a rejection's is stored as `decisionReason`. Both are saved and shown, so the AC is met.

---

## US-09 Request clarification from the Organiser through the system (Event Coordinator)

### TC-S1-15

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-15 |
| Story/AC ref | US-09 AC-1 (UI) |
| Test Scenario | The clarification form offers a text field for the question |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in to the web app as coord.a@example.com. |
| Test Steps | 1. Open request `EVT-146`.<br>2. Choose "Request clarification" as the decision. |
| Test Data | — |
| Expected Result | A text field is shown for entering the clarification question. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | — |
| Status | Not Executed |
| Remarks | This AC is about the user interface. |
| Executed By | — |
| Date of Execution | — |
| Automated by | Playwright (pending) |

### TC-S1-16

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-16 |
| Story/AC ref | US-09 AC-1, AC-2 |
| Test Scenario | Coordinator submits a free-text question, which is saved against its request (happy path) |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody submits a clarification question on `EVT-146`.<br>2. Look up the clarification messages for `EVT-146`. |
| Test Data | "Can you confirm the expected attendance?" and "Which venue did you have in mind?" |
| Expected Result | The question is accepted and saved, tied to request `EVT-146`, with Cody as its author. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 201 with the question as the outstanding clarification. Exactly one message is stored for `EVT-146`, with the same text and Cody as author. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::accepts a free-text question`<br>Integration: `test/events-clarification.e2e-spec.ts::stores the message against the event` |

### TC-S1-17

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-17 |
| Story/AC ref | US-09 AC-1 (negative) |
| Test Scenario | Submitting the clarification form with no question |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody submits an empty question.<br>2. Cody submits the form with no question field at all. |
| Test Data | question `""`; body `{}` |
| Expected Result | The submission is refused with a clear message. No question is recorded. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 400 with "a question is required to request clarification" for the empty question, and HTTP 400 for the missing field. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::requires the question to be non-empty`<br>Integration: `test/events-clarification.e2e-spec.ts::rejects a missing question entirely` |

### TC-S1-18

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-18 |
| Story/AC ref | US-09 AC-1 (boundary) |
| Test Scenario | The clarification question contains only spaces |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com. |
| Test Steps | 1. Cody submits a question of three spaces on `EVT-146`.<br>2. Read the request back. |
| Test Data | question `"   "` |
| Expected Result | The submission is refused, because no question has been entered. The request stays Submitted. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | HTTP 400 with "a question is required to request clarification". No clarification message was stored. The request stayed SUBMITTED with no outstanding question. 26/26 passed in each of 3 runs. |
| Status | Pass |
| Remarks | Bug found by test audit; fixed (gap #1) in 93316fa. This test is its regression test. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::rejects a whitespace-only question` |

### TC-S1-19

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-19 |
| Story/AC ref | US-09 AC-3 |
| Test Scenario | After a question is asked, both parties see the status "Awaiting Clarification" |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com and organiser@example.com. |
| Test Steps | 1. Cody asks a question on `EVT-146`.<br>2. Read the stored status.<br>3. The Organiser opens the request.<br>4. Cody opens the request. |
| Test Data | Question "Can you confirm the attendance?" |
| Expected Result | The request status updates to "Awaiting Clarification", visible to both the Coordinator and the Organiser. The Organiser can also see what is being asked. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The stored status is AWAITING_CLARIFICATION. The Organiser's view shows that status with `clarificationRequested: true` and the question. The Coordinator's view shows the same status. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::updates the stored status`<br>Integration: `test/events-clarification.e2e-spec.ts::is visible to the Organiser`<br>Integration: `test/events-clarification.e2e-spec.ts::is visible to the Coordinator` |

### TC-S1-20

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-20 |
| Story/AC ref | US-09 AC-4 |
| Test Scenario | When the Organiser responds, the Coordinator is notified |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com and organiser@example.com. |
| Test Steps | 1. Cody asks a question on `EVT-146`.<br>2. The Organiser submits a response.<br>3. Check Cody's notifications. |
| Test Data | Response "We expect 320 attendees" |
| Expected Result | The Coordinator is notified that the Organiser has responded on this request. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | — (not recorded; see Remarks) |
| Status | Not Executed |
| Remarks | Notifications in progress (Sprint 3 story: Be Notified of My Request Outcome). The linked test currently checks only that a CLARIFICATION_ANSWERED notification record is stored for the Coordinator. It passed on 2026-10-17, but that is not yet the notification the AC describes. |
| Executed By | — |
| Date of Execution | — |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::notifies the Coordinator when the Organiser responds` |

### TC-S1-21

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-21 |
| Story/AC ref | US-09 AC-5 |
| Test Scenario | Both parties see the whole exchange as a timestamped audit trail, with sender and time |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test). Logged in as coord.a@example.com and organiser@example.com. |
| Test Steps | 1. Cody asks Q1, the Organiser answers A1, Cody asks Q2, and the Organiser answers A2.<br>2. The Organiser opens the request.<br>3. Cody opens the request. |
| Test Data | "Q1: how many attendees?", "A1: 320", "Q2: any accessibility needs?", "A2: hearing loop" |
| Expected Result | All questions and responses are shown in order, each with its sender and time, to both the Coordinator and the Organiser. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | The Organiser sees all 4 entries in order. Each entry names its author (id, role and email), every entry has a valid timestamp, and the timestamps are ascending. The Coordinator sees the same trail. |
| Status | Pass |
| Remarks | — |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::shows the full exchange to the Organiser`<br>Integration: `test/events-clarification.e2e-spec.ts::identifies the sender of each entry`<br>Integration: `test/events-clarification.e2e-spec.ts::timestamps every entry, in chronological order`<br>Integration: `test/events-clarification.e2e-spec.ts::shows the same exchange to the Coordinator` |

### TC-S1-22

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-22 |
| Story/AC ref | US-09 AC-2/AC-4, with US-02 AC-5/AC-6 (permission) |
| Test Scenario | Only the assigned Coordinator can ask, and only the owning Organiser can answer |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql + tc-s1-22-setup.sql on testDB (reset before test). `EVT-146` is owned by organiser@example.com and assigned to Cody. Logged in as coord.b@example.com (not assigned) and other@example.com (a different Organiser). |
| Test Steps | 1. Casey tries to ask a question on `EVT-146`.<br>2. Cody asks a question.<br>3. Otto (other@example.com) tries to answer it. |
| Test Data | Question "Q?"; Otto's response "Not mine" |
| Expected Result | Both attempts are denied. Neither Casey nor Otto can take part in this request's clarification thread. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | Casey got HTTP 404 and Otto got HTTP 404. |
| Status | Pass |
| Remarks | Denied = 404 by design (agreed decision), as in TC-S1-06. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::refuses a Coordinator who is not assigned`<br>Integration: `test/events-clarification.e2e-spec.ts::refuses a response from another Organiser` |

### TC-S1-63

| Test case specification | |
|---|---|
| Test Case ID | TC-S1-63 |
| Story/AC ref | US-09 AC-4 (conflict) |
| Test Scenario | The Organiser's response to one clarification question is sent twice at the same moment |
| Pre-conditions | Run test/fixtures/sql/base-users.sql + tc-s1-01-setup.sql on testDB (reset before test, and again before each of the 20 iterations). `EVT-146` is owned by organiser@example.com and assigned to coord.a@example.com. Cody asks one question through the API, so the request is AWAITING_CLARIFICATION. Logged in as organiser@example.com. |
| Test Steps | 1. Reset the testDB and load the pre-condition scripts.<br>2. Cody asks "Which room layout do you need?".<br>3. Olivia sends two responses for `EVT-146` at the same moment (`Promise.all`).<br>4. Read the stored status, the number of stored answers and the number of notifications to Cody.<br>5. Repeat steps 1–4 for 20 iterations. |
| Test Data | Question "Which room layout do you need?"; responses "Theatre style" and "Boardroom style"; 20 iterations |
| Expected Result | Exactly one response is accepted and the other is refused with 409 Conflict. The request is UNDER_REVIEW, the thread holds one answer, and the Coordinator is notified once. |
| Created By | Raye Yap |
| Date of Creation | 2026-10-17 |
| **Test execution record** | |
| Actual Result | After the fix: in 3 runs of 20 iterations (60 in total), one response returned 201 and the other 409 every time. The status was UNDER_REVIEW, with 1 answer stored and 1 notification record for Cody. (Before the fix: both returned 201 in 57 of 60 iterations, with 2 answers and 2 notifications. Only the first iteration of each run was clean.) |
| Status | Pass |
| Remarks | Bug found by test audit; fixed (gap #3). `respondToClarification()` now starts its transaction with the same row lock as the review decisions (`claimForDecision`), so the loser gets 409 and its answer and notification are never saved. The notification is checked as a stored record only (see TC-S1-20). Listed after TC-S1-22 to keep it with US-09. |
| Executed By | Raye Yap (automated) |
| Date of Execution | 2026-10-17 |
| Automated by | Integration: `test/events-clarification.e2e-spec.ts::accepts exactly one of two simultaneous responses to the same question` |

**US-09 AC ↔ code mismatches**
- **AC-1 (fixed):** a whitespace-only question used to be accepted (audit gap #1). Fixed in 93316fa, and TC-S1-18 is now its regression test.
- **AC-4:** "the Coordinator is notified" is only met by storing a notification record today. Nothing is delivered (no email, push or in-app feed). TC-S1-20 stays Not Executed until the Sprint 3 story "Be Notified of My Request Outcome" lands.
- **AC-4 (fixed):** two simultaneous responses to one question were both accepted, storing two answers and notifying twice (audit gap #3). Fixed, and TC-S1-63 is now its regression test.

---

## US-10 Be assigned as main point of contact for an event (Event Coordinator)

Test cases for this story are written in a later batch of the Sprint 1 regeneration.

---

## US-11 Event status updates automatically as actions are taken (Event Coordinator)

Test cases for this story are written in a later batch of the Sprint 1 regeneration.

---

## US-12 View all details of a submitted event request (Event Coordinator)

Test cases for this story are written in a later batch of the Sprint 1 regeneration.

---

## US-13 Add a new venue with its key characteristics (Venue Staff)

Test cases for this story are written in a later batch of the Sprint 1 regeneration.

---

## US-14 Update a venue's details as facilities change (Venue Staff)

Test cases for this story are written in a later batch of the Sprint 1 regeneration.

---

## US-15 Browse the full catalogue of venues (Venue Staff)

Test cases for this story are written in a later batch of the Sprint 1 regeneration.

---

## Changes since Sprint 1

Changes to the system or to these test cases made after the Sprint 1 review, newest first.

| Date | Change | Commit | Test cases affected |
|---|---|---|---|
| 2026-10-26 | **Regeneration, batch 2 (US-05 to US-08).** Every test commented with its test case, story/AC and a `Code:` line. US-06 AC-6 now uses `tc-s1-54-setup.sql` (a request assigned to the Coordinator); US-05 AC-4's "under review" step goes through a real clarification answer; US-07's assignment goes through the Lead's `/assignments` endpoint. New UI tests (Organiser list and form) and browser tests (`e2e/us05-us08-review.spec.ts`). **Code changes:** the request form now records any number of accessibility requirements and no longer drops all but the first when a request is reopened (US-06 AC-3); the Coordinator's review page shows accessibility needs in the form's wording. | this commit | TC-S1-54: Not Executed → Pass. New: TC-S1-79 to 83. All US-05 to US-08 cases re-run. |
| 2026-10-26 | **Regeneration, batch 1 (US-01 to US-04), after the Sprint 3/4 merges.** Stories now follow the user-story document's order. Every test cites its test case, story and AC, and a `Code:` line. New UI tests (React Testing Library) and browser tests (Playwright, `npm run test:browser`). `test/access-control.e2e-spec.ts` moved to the shared setup scripts (`tc-s1-67-setup.sql`). New `tc-s1-25-setup.sql` adds the Event Coordinator Lead. **Code change:** the request form now confirms a successful submission or save (US-03 AC-2). | `7f8783b` | TC-S1-25, 34, 58: Not Executed → Pass. New: TC-S1-64 to 78. All US-01, 03, 04 cases re-run. |
| 2026-10-17 | **Test apps match production; coverage gaps filled.** `configureApp()` is now shared by `main.ts` and the 8 converted integration files, so tests see the same pipes, `UnauthorizedFilter` and CORS as production; no existing result changed. Two tests were added from coverage-s1.md: the 401 carries `WWW-Authenticate` and `loginUrl`, and a numeric email gets 400. | `895d205` (setup); this commit (tests) | TC-S1-56 and TC-S1-57 (extra test each; still Pass). |
| 2026-10-17 | **Concurrent clarification responses made atomic (audit gap #3).** `respondToClarification()` starts its transaction with the same row lock as the review decisions (`claimForDecision`), so a second, simultaneous response gets 409 and stores nothing. The conflict message is now neutral: "this request has just been updated by someone else; reload it and try again". | this commit | TC-S1-63 (new; Fail as `it.failing` in `da1e278`, now Pass). |
| 2026-10-17 | **Concurrent review decisions made atomic (audit gap #2).** Approve, reject, return and request clarification each start their transaction by row-locking the request only while it still holds the status that was read (`claimForDecision`, `SELECT … FOR UPDATE`). A concurrent decision waits, then gets 409 Conflict, and its reason, question and history roll back. `setStatus()` is still the only writer of status. | `61401ec` | TC-S1-07 (Fail → Pass; the race test is now a regular regression test, no longer `it.failing`, and requires the loser to get 409). |
| 2026-10-17 | **US-01 lockout window-edge tests added.** The existing tests covered the 14/15 boundary but not the 30-minute window edge. Three unit tests (frozen clock: exactly 30 min locks; 30 min + 1 ms restarts the count; the correct password is refused while locked) and one integration test (15 failures spread beyond 30 minutes don't lock). `test/auth.e2e-spec.ts` was converted to the shared test-DB pattern, with assertions unchanged. | — | TC-S1-61 (new, Pass). TC-S1-55 to 60 and 62 now load base-users.sql. |
| 2026-10-17 | **Week 7 Change 5 handover (Event Coordinator Lead, unassigned queue).** Change 5 is being built on `Sprint3-MAIN`, so two test cases wait on it here. Five existing integration tests assert the pre-Change-5 pool, where any Coordinator sees unassigned submissions. They are handed to the Sprint 3 tester, to update when Change 5 merges:<br>`events-submit::makes the request visible to a Coordinator for review`<br>`events-draft::makes it visible to a Coordinator once submitted`<br>`events-layout::shows layout and accessibility in the review queue`<br>`events-layout::shows them when the Coordinator opens the request`<br>`events-review::approves once that request has been assigned (US-10 then US-07)` | — | TC-S1-25 (Lead's unassigned queue; Not Executed, pending Change 5 merge). TC-S1-54 (assigned Coordinator sees the preferences; linked in group 3 via tc-s1-54-setup.sql). |
| 2026-10-17 | **Gap tests added.** TC-S1-27: US-03 boundaries, as 15 unit tests with a frozen clock plus 1 integration test. TC-S1-18: whitespace-only question. TC-S1-07: simultaneous approve and reject, which reproduces audit gap #2 in 60 of 60 iterations and is captured as `it.failing`. | — | TC-S1-27 and TC-S1-18 are now Pass. TC-S1-07 is now Fail (known bug, gap #2). |
| 2026-10-17 | **Whitespace-only text rejected in required fields (audit gap #1).** The test audit found that `@IsNotEmpty` accepted `"   "`. A new `@Trim()` transform now runs on every Sprint 1 text field: event request, draft, reject/return reason, clarification question/response and venue draft. Whitespace-only required text is now refused; optional text is trimmed and may be empty. | `93316fa` | TC-S1-11 (Fail → Pass; its test is now a regular regression test, no longer `it.failing`). TC-S1-18 and TC-S1-27 are covered by the fix but still need their tests (GAP). |

---

## Gaps (no automated test yet)

| Test case | Story/AC | What's missing |
|---|---|---|
| TC-S1-15 | US-09 AC-1 (UI) | A UI or browser check that the clarification form offers a text field (batch 3) |
| TC-S1-20 | US-09 AC-4 | Checking the Coordinator is notified of a response (batch 3) |
| US-10 to US-15 | all | Test cases to be written in batches 3 and 4 |
