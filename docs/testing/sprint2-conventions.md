# Sprint 2 testing conventions

Sprint 2 follows [CONVENTIONS.md](CONVENTIONS.md) (the shared rules: test database, reset before every test, setup scripts, Arrange-Act-Assert, FIRST, specific assertions). This file only adds what is specific to Sprint 2.

## Scope and ownership

- **Sprint 2 stories: 16–37.** Owned by Marilyn. Stories 13–15 belong to Sprint 1 (Raye).
- Sprint 2 artefacts are Sprint 2-named so they can't collide with Sprint 1's:

| Thing | Sprint 2 | Sprint 1 |
|---|---|---|
| Test case IDs | `TC-S2-XX` | `TC-S1-XX` |
| Setup scripts | `test/fixtures/sql/tc-s2-XX-setup.sql` | `tc-s1-XX-setup.sql` |
| Test case document | [sprint2-test-cases.md](sprint2-test-cases.md) | [sprint1-test-cases.md](sprint1-test-cases.md) |

- `base-users.sql` and `base-venues.sql` are shared and never edited. Extra rows (for example a second Venue Staff member) go in a `tc-s2` script: see `tc-s2-01-setup.sql`.
- A script used by several test cases is named after the first test case that needs it.

## Story numbering: tests vs app code

**Every test file** (`test/*.e2e-spec.ts` and `src/**/*.spec.ts`) and every test document uses the **user-story document's** numbers: Story 29 is `US-29` in a test name.

**App code, the frontend and migration folder names** still use the older labels, which are one higher from Story 19 on. Those were left unchanged on purpose: migration folder names are recorded by name in the shared Supabase database and must never be renamed, and the app code belongs to several teammates. Use this table to find a story's code in `src/`, `frontend/src/` or `prisma/`:

| Story (document, tests) | Label in app code and migrations | Title |
|---|---|---|
| 16 | US-16 | Venue Availability Calendar |
| 17 | US-17 | View a venue's availability calendar before requesting it |
| 18 | US-18 | Search and filter venues |
| 19 | US-20 | System flags whether a venue appears suitable |
| 20 | US-21 | Submit a request to book a venue |
| 21 | US-22 | Venue Booking Request Queue |
| 22 | US-23 | Approve/Reject Booking Request with Reason |
| 23 | US-24 | Overlapping Booking Detection |
| 24 | US-25 | Update event information during planning |
| 25 | US-26 | View history of changes to an event |
| 26 | US-27 | Have an event reassigned |
| 27 | US-28 | Record equipment and technical requirements |
| 28 | US-29 | View the equipment catalogue |
| 29 | US-30 | Check equipment availability |
| 30 | US-31 | View equipment and technical requirements |
| 31 | US-32 | Reserve available equipment |
| 32 | US-33 | Release equipment reservations for a cancelled event |
| 33 | US-34 | Register for an event |
| 34 | US-35 | View my registration status |
| 35 | US-36 | Withdraw my registration |
| 36 | US-37 | Request an event change |
| 37 | US-38 | Review change requests |

## In each integration test

```ts
// TC-S2-XX · US-NN AC-N · setup: base-users + base-venues + tc-s2-XX-setup · fails if <the bug this catches>
// Code: <what the code under test does that makes this pass: the method, DTO, guard or constraint>
it('<behaviour, in words>', async () => {
  await given('tc-s2-XX-setup');   // Arrange: the script the test case names
  ...                              // Act, then Assert
});
```

- The file's header comment names the story (`US-NN (Story NN)`) and summarises the code under test: the routes, service methods and rules the tests exercise.
- From Story 22 on, each test's comment also names its story and AC (`US-NN AC-N`) and has a `Code:` line. Stories 16–21 carry the story in the file header and `describe` titles only.
- `beforeEach`: `resetDb(prisma)`, then `loadSql` of the base scripts the file needs.
- The app uses `configureApp(app)` and `app.listen(0, '127.0.0.1')`, as in the converted Sprint 1 specs.
- Users log in once in `beforeAll`. Their IDs are fixed, so the tokens stay valid after every reset.

## Time-dependent behaviour

Where an AC depends on today's date (Story 21 AC-5, "nearing their event date"), the spec freezes the clock with `jest.useFakeTimers({ now, doNotFake: [...] })`, faking only `Date`. Real timers keep running, so the HTTP server, Prisma and Supertest behave normally, and the setup script uses fixed dates relative to that frozen "now". See `test/bookings-queue.e2e-spec.ts`.

## Manual test cases

UI-only ACs (switching calendar views, the phone layout, visual styling) have manual test cases (Automated by: Manual, Status: Not Executed until run). Run them on the app and fill in the execution record.

## Code gaps found while writing Sprint 2 test cases

These ACs are not (fully) implemented, or don't behave as the AC asks. The test case Remarks record each one. A gap with nothing to test has a test case with no automated test (Status Fail). A bug in existing behaviour is captured with `it.failing`, which passes while the bug is there and alerts once it is fixed, so it can become a plain `it`.

| Story | AC | Gap |
|---|---|---|
| 17 | AC-1 | Blocked-off periods (Story 16) are not shown on the Coordinator's venue calendar. |
| 19 | AC-3 | Facilities are not checked against the event's equipment/technical requirements (TC-S2-30, Status Fail). |
| 20 | AC-2 | The structured equipment list and "technical support needed" (Story 27) are not attached to a booking request; only the free-text equipment notes are. |
| 22 | AC-2 | **Bug:** a rejection (or reversal) reason of only spaces is accepted and saved as an empty reason; `RejectBookingDto`/`ReverseBookingDto` lack `@Trim()` (TC-S2-49, Status Fail, `it.failing`). |
| 23 | AC-5 | A hard conflict can be resolved by reversing the confirmed booking, but there is no way to *reassign* it (move it to another time or venue). |
| 23 | AC-6 | Buffer time is not applied. Superseded: a code comment in `BookingsService.conflictsFor()` records that the customer said it isn't needed (TC-S2-66, Status N/A). |
| 23 | AC-7 | A booking request's time can't be edited, so there is no edit to re-check (TC-S2-67, Status Fail). |
| 24 | AC-2 | Changes are flagged for review, but the AC doesn't say who reviews them or how the flag is cleared; neither is built. |
| 26 | AC-1 | The system has no record of a Coordinator's availability; any responsible Coordinator may ask for reassignment (TC-S2-84, noted in Remarks). |
| 27 | AC-1 | **Bug:** an equipment type of only spaces is accepted and saved as an empty type; `EquipmentRequirementDto` lacks `@Trim()` (TC-S2-90, Status Fail, `it.failing`). |
| 29 | AC-2 | Only confirmed (approved) reservations are excluded; a reservation still awaiting approval holds nothing. Confirm this reading with the team (TC-S2-108, Remarks). |
