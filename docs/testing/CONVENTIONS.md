# Testing conventions (read at the start of every session)

## Branch & ownership
- Work only on `sprint3-RAYE`. Check the branch at the start of every session. Never touch sprint1-main, sprint2-main or Sprint3-MAIN.
- Raye owns Sprint 1 test evidence; a teammate owns Sprint 2. Keep Sprint 1 artefacts in Sprint 1-named files (`tc-s1-*`, `sprint1-test-cases.md`) so the two can't collide.
- Teammates edit `src/` in parallel: only add or modify files in `test/`, Sprint 1 `src/**/*.spec.ts` files, and `docs/testing/`. Ask before changing any application code.
- Many existing tests were written by teammates. Never delete a test without Raye's explicit approval of a written list.

## Goal
Sprint 1 test evidence that Raye can explain in a live Q&A, where instructors may ask her to "trace a requirement to its implementation and tests". Every Sprint 1 AC maps to a small, named set of tests in the traceability matrix. Remove only bad tests: duplicates, vacuous assertions, framework-only tests, padding. Every kept test traces to an AC, a boundary, a failure/conflict/permission scenario, or an uncovered branch.

## Requirements (brief + rubric)
- Test cases cover the features and are traceable from story/AC → test case → test.
- Top band: unit + integration/E2E tests for normal, boundary, conflict and failure scenarios; 100% coverage unless not possible and stated why.
- Test cross-feature relationships (e.g. status changes match actions; an approved booking blocks the venue for overlapping slots).
- Role-based access is core: each role only views/modifies what fits its role and its relationship to the event.
- No CI in this rebuild (a later sprint). Keep the run commands simple.

## Test layers (course terms ↔ our repo)
- Unit = `src/**/*.spec.ts`. Jest; Prisma and other dependencies mocked; no database.
- Integration = `test/*.e2e-spec.ts`. Real Nest app via Supertest → controller → service → Prisma → the PostgreSQL test DB. Call these "integration tests" in docs.
- E2E = Playwright on the frontend (later session, 1–3 journeys only).

## Test database (MANDATORY: graded)
- The testDB is the dedicated local PostgreSQL DB `connectsphere_test` (`TEST_DATABASE_URL`), NEVER the shared Supabase DB. SQLite isn't possible (Postgres-only schema features); this substitution is documented with its reasons.
- Never run `prisma:seed`, `prisma:seed:roles`, `prisma migrate`, or `scripts/*`: they target the Supabase `DATABASE_URL`. Only run `npx jest` and `npm run test:e2e -- <file>`.
- Before EVERY integration test: reset all tables via ONE shared helper (`TRUNCATE … RESTART IDENTITY CASCADE`), then run the test case's setup script(s).
- Setup scripts live in `test/fixtures/sql/`: `base-users.sql` (one user per role) and `base-venues.sql` (a few venues, load only when needed) plus `tc-s1-XX-setup.sql` where needed. Plain SQL with fixed IDs, dates and values. A README explains each script.
- Every test case's Pre-conditions field says: "Run test/fixtures/sql/<script>.sql on testDB (reset before test)". The integration test loads that SAME script (this is the traceability link).
- Why we reset (be ready to explain): known starting state → repeatable, isolated tests (FIRST).
- Supabase Storage is always faked in tests.

## Rules
- Jest describe/it with Arrange-Act-Assert; one behaviour per test; descriptive names ("rejects booking when venue already booked for an overlapping slot").
- FIRST: no real timers or sleeps (use jest fake timers / an injected clock), no order dependence, no shared state between tests.
- Expected values come from the ACs below, not from the implementation. If an AC is ambiguous, ASK.
- Boundaries: test just below, at, and just above each one.
- Use stubs for canned answers; use mocks (`expect(...).toHaveBeenCalledWith`) only when the interaction IS the requirement. Never mock the unit under test.
- Use specific assertions (`toEqual`, `toThrow(SpecificError)`, exact status codes), not `toBeDefined`/`toBeTruthy`.
- Known bugs are captured with `it.failing(...)` plus a comment naming the audit gap, until the fix lands.
- Each test includes a comment with its TC ID(s), its setup script (integration tests only), and one line on what bug would make it fail.
- Test case IDs: `TC-S1-XX`. Story IDs: `US-XX`. AC IDs: `US-XX AC-n` (numbered in the order listed below).
- Do one phase per session, then commit, update `docs/testing/PROGRESS.md`, and STOP.

## Open bugs found by the audit
1. ~~Whitespace-only text accepted in required fields (US-03 AC-3, US-08 AC-2, US-09 AC-1).~~ **Fixed in `93316fa`.** Regression tests: `test/events-decision.e2e-spec.ts` ("%s is blocked when the reason is whitespace-only", TC-S1-11), plus TC-S1-18 and TC-S1-27.
2. Simultaneous approve and reject can both succeed (US-07, US-08, US-11). **Still open.** Captured as `it.failing` in `test/events-review.e2e-spec.ts` (TC-S1-07). It reproduces in 60/60 iterations.

## Sprint 1 stories

### US-01 Log in securely (Any user)
- AC-1: Registered user with valid credentials logs in → authenticated, valid session established.
- AC-2: Incorrect email or password → rejected, no session, generic error "invalid email or password" that doesn't reveal which field was wrong.
- AC-3: Unauthenticated user opens any protected page directly (e.g. via URL) → redirected to login, no protected data returned.
- AC-4: Authenticated user logs out → session terminated; protected pages inaccessible until logging in again.
- AC-5: 15 consecutive failed attempts within 30 minutes → further attempts temporarily locked; user must contact the helpline.

### US-02 Role-appropriate access restriction (Any user)
Prerequisite: a permission matrix (role × resource × action) is the single source of truth; every AC tests against it.
- AC-1: No explicit grant for a role's action → denied, nothing changes (default-deny).
- AC-2: Granted role action → succeeds.
- AC-3: Ungranted action invoked directly via API/URL → server rejects it (not UI-only).
- AC-4: User loads the system → only their granted menus and controls are visible.
- AC-5: Event Organiser views event requests → sees only their own organisation's requests; others return denied.
- AC-6: Event Coordinator views events → sees only events assigned to them; others return denied.
- AC-7: Attendee accesses an event → sees only public/registration-facing info, no internal planning info.
- AC-8: Unauthenticated request to a protected resource → denied and redirected to login.

### US-03 Submit a new event request (Event Organiser)
- AC-1: All required fields (purpose, event type/category, proposed date and time, expected attendance) provided and valid → request submitted and recorded with status "Submitted".
- AC-2: Successful submission → Organiser gets confirmation; request becomes visible to Coordinators for review.
- AC-3: Required fields missing or invalid (e.g. past date, non-numeric attendance, end time before start time) → submission blocked; each offending field flagged with a clear message.
- AC-4: Organiser views a submitted request → all entered details displayed accurately with current status.
- AC-5: Expected attendance → stored as a positive whole number for later venue-suitability checks.

### US-04 Save an incomplete request as a draft (Event Organiser)
- AC-1: Save as draft with required fields still empty → saved without full submission validation.
- AC-2: Organiser returns later → can open the draft and continue editing.
- AC-3: Organiser views their request list → draft clearly marked "Draft", visually distinguishable from submitted requests.
- AC-4: Organiser completes required fields on a draft and submits → status changes from "draft" to "submitted".
- AC-5: Request already submitted → does not appear or behave as an editable draft.

### US-05 View current status of my event request (Event Organiser)
- AC-1: Each request displays its current status (draft, submitted, under review, approved, rejected, planning, confirmed, completed, cancelled).
- AC-2: Rejected request → Organiser can see the Coordinator's reason.
- AC-3: Coordinator requested clarification → Organiser sees that clarification is needed and what is being asked.
- AC-4: Status changes (e.g. submitted → under review) → next view shows the most recent valid state.
- AC-5: Request belongs to another Organiser → does not appear; Organiser only sees their own.

### US-06 Specify preferred room layout and accessibility requirements (Event Organiser)
- AC-1: Creating/editing a request → can select a preferred layout from a predefined list (e.g. theatre, classroom, banquet, boardroom).
- AC-2: Layout not in the list / needs qualification → can add optional free-text notes alongside the selection.
- AC-3: Can record accessibility requirements (e.g. step-free access, hearing loop, accessible restrooms) with optional free-text notes.
- AC-4: Layout and accessibility saved (draft or submitted) → values persist and are visible when reopened or reviewed.
- AC-5: Layout and accessibility left empty → request still saves; these are preferences, not blockers.
- AC-6: Coordinator opens a submitted request → sees the layout and accessibility values entered.

### US-07 Review submitted request for clarity/completeness (Event Coordinator)
- AC-1: Coordinator views a request → its current status (e.g. draft, submitted, under review, approved, returned, rejected) is displayed.
- AC-2: Coordinator opens a submitted request → all details (e.g. name, purpose, description, proposed date and time) displayed.
- AC-3: Coordinator clicks "Approve" on a request ready to proceed → status updates to "Approved".

### US-08 Reject or return a request with a reason (Event Coordinator)
- AC-1: Coordinator selects "Reject" or "Return" → system performs that specific action, separate from the other.
- AC-2: Coordinator confirms reject/return without a reason → confirmation prevented until a reason is entered.
- AC-3: Reject/return confirmed with a reason → status updates to "Rejected" or "Returned" accordingly.
- AC-4: Decision confirmed → reason and decision saved and retained with the request.

### US-09 Request clarification from the Organiser (Event Coordinator)
- AC-1: Coordinator opens the clarification form → a text field is available for clarification questions.
- AC-2: Clarification request saved → tied to its event request.
- AC-3: Clarification submission confirmed → status updates to "Awaiting Clarification", visible to both Coordinator and Organiser.
- AC-4: Organiser submits a response → Coordinator is notified.
- AC-5: Coordinator or Organiser views the event record → all questions and responses shown as a timestamped audit trail with sender and time.

### US-10 Be assigned as main point of contact (Coordinator)
- AC-1: Coordinator is linked to a submitted event as main contact.
- AC-2: Event can be reassigned to a different Coordinator if availability changes.
- AC-3: Assigned Coordinator is visible to any authorised user viewing the event.

### US-11 Event status updates automatically as actions are taken (Coordinator)
- AC-1: Event always shows one of: draft, submitted, under review, approved, planning, awaiting arrangements, confirmed, completed, cancelled, rejected.
- AC-2: Rejected request → decision and reason shown with the status.
- AC-3: Another story changes the status (submission, review, rejection, clarification) → displayed status updates to match.

### US-12 View all details of a submitted event request (Coordinator)
- AC-1: Coordinator viewing a submitted event sees name, description, purpose, dates, attendance, venue requirements and accessibility needs.
- AC-2: Event has equipment or registration requirements → shown alongside the core details.
- AC-3: User not assigned to / associated with the event → can't view it; system returns no event data.

### US-13 Add a new venue with its key characteristics (Venue Staff)
- AC-1: Adding a venue → can specify location, capacity, facilities, accessibility features, supported layouts and operating hours.
- AC-2: Incomplete details → can save the venue as a draft without all required fields.
- AC-3: Publishing a draft → prevented until all required fields (e.g. name, capacity) are completed.
- AC-4: Draft venue → does not appear when a Coordinator searches/browses; drafts visible only to the managing Venue Staff.
- AC-5: All required fields completed and published → persisted; appears in the catalogue on the Coordinator's next load/refresh.
- AC-6: Venue Staff views the catalogue → can distinguish published from draft venues (e.g. a status label).

### US-14 Update a venue's details as facilities change (Venue Staff)
- AC-1: Opening an existing venue → can edit any details (capacity, facilities, accessibility, layouts, operating hours).
- AC-2: Changes saved → persisted; catalogue reflects them on next load/refresh.
- AC-3: Venue has active/upcoming bookings and a suitability-affecting detail changes (e.g. reduced capacity) → Venue Staff is notified existing bookings may need review.
- AC-4: A required field is cleared and left blank → saving prevented until it's filled again.

### US-15 Browse the full catalogue of venues (Venue Staff)
- AC-1: Opening the catalogue → list of all venues with key details at a glance (name, location, capacity).
- AC-2: Selecting a venue → full details (facilities, accessibility, layouts, operating hours).
- AC-3: Many venues → can locate a specific venue without scrolling through unrelated ones (e.g. sorting or lookup by name).
- AC-4: Venue added/updated → after load/refresh, list reflects the latest persisted data, not a stale/cached version.