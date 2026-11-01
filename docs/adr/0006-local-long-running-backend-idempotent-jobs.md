# ADR 0006 — Backend runs locally as a long-running Node process; scheduled jobs must be idempotent

- Status: Accepted
- Date: 2026-10-17 (first scheduled job, US-54 hold expiry)
- Story: #54 Tentative venue hold with expiry, #59 Registration window notices

## Context

The backend is not deployed. There is no Dockerfile, Procfile or hosting config. CI builds and
tests but has no deploy step. Each teammate runs `npm run dev` / `nest start --watch` on their own
machine. When several of those processes point at the shared Supabase database, they all run the
same cron jobs against the same rows.

TODO(team): confirm why the backend is not deployed (course scope, cost, or timing).

## Decision

- Scheduled work uses `@nestjs/schedule` inside the API process. `ScheduleModule.forRoot()` is
  registered except under `NODE_ENV=test`. Tests call the jobs directly.
- Every job must be safe to run late, twice, or in two processes at the same moment:
  - **Hold expiry and 24-hour warnings** (`hold-expiry.ts`): one conditional
    `UPDATE … WHERE status='HELD' AND holdExpiresAt <= now RETURNING id`. Warnings are claimed
    through `holdWarningSentAt IS NULL`. Only the rows returned are notified, in the same
    transaction. No read-then-write.
  - **Registration opened/closed/near-capacity** (`registration-notifications.service.ts`): each
    notice is claimed once through a `*NotifiedAt` stamp on `EventRequest`.
- Correctness must not depend on the job running. An expired hold is already free to every query
  (`isLiveHold`), and the next write on its venue releases it (ADR 0001).
- Each sub-job is wrapped in its own try/catch. One failing does not stop the others, and the job
  retries on the next minute.

## Consequences

- ➕ Any number of teammates' servers can share a database without notifying anyone twice.
- ➕ The pattern carries over unchanged if the backend is ever deployed with several replicas.
- ➖ If nobody's backend is running, nothing is released and no notices are sent. They catch up
  when the next process starts. Holds still read as expired.
- ➖ N running servers make N× the every-minute queries against the shared database.
- ➖ Every new job must follow the claim-by-conditional-update pattern. Nothing checks that
  automatically.

## Related

- [ADR 0001](0001-held-hard-blocks-at-db-level.md), [ADR 0005](0005-local-db-shared-supabase-after-merge.md)
- `src/app.module.ts`, `src/bookings/hold-expiry.scheduler.ts`, `src/bookings/hold-expiry.ts`,
  `src/registrations/registration-notifications.scheduler.ts`,
  `src/registrations/registration-notifications.service.ts`
- `prisma/migrations/20261017090000_us54_venue_holds`, `20261022090000_registration_window_notifications`
- Tests: `src/bookings/hold-expiry.spec.ts`, `src/bookings/hold-expiry.scheduler.spec.ts`,
  `test/us54-venue-holds.e2e-spec.ts`
