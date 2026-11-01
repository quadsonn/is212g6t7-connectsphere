# ADR 0005 — Develop against local Postgres; migrate the shared Supabase DB only after merge to main

- Status: Accepted
- Date: TODO(team): confirm (the Supabase setup notes in the README predate 2026-10-26)
- Story: none (team workflow)

> **⚠ Contradiction with the code and docs.** Nothing enforces "only after merge to main":
> - No CI job or script migrates Supabase. CI (`.github/workflows/ci.yml`) only migrates a
>   temporary Postgres container.
> - `README.md` "Team setup notes" tells each teammate to point `DATABASE_URL`/`DIRECT_URL` at
>   Supabase and run `npx prisma migrate deploy` from their own clone, whichever branch they are on.
> - `.env.example` defaults `DATABASE_URL`/`DIRECT_URL` to the Supabase pooler.
> - The scheduler comments say "every teammate's local server" shares one database (ADR 0006).
>
> TODO(team): confirm who runs `migrate deploy` against Supabase, and when.

## Context

Migrations here are often hand-written SQL: EXCLUDE constraints, enum conversions, preflight
checks. A half-finished migration applied to the shared database affects everyone. Supabase routes
app traffic through PgBouncer, which migrations cannot reliably use, so a separate `DIRECT_URL` is
needed (`.env.example`).

TODO(team): confirm reasoning for "only after merge to main".

## Decision

- Everyday development uses a local Postgres (README step 3: "For local development, replace
  `DATABASE_URL` and `DIRECT_URL` with your local database").
- Tests never touch Supabase. `TEST_DATABASE_URL` must be a local database ending in `_test`.
  `test/e2e-setup.ts` overrides `DIRECT_URL` too, so test migrations cannot reach the shared DB.
- Manual scripts (`scripts/cancel-event.ts` etc.) refuse to run unless `DATABASE_URL` is localhost.
- The shared Supabase DB is migrated only from merged `main` (convention, not enforced).

## Consequences

- ➕ Migrations are tried and reset locally before anyone else sees them. The test suite cannot
  truncate shared data.
- ➖ The rule depends on discipline. The current README steps would migrate Supabase from a feature
  branch.
- ➖ Local and shared data drift apart. Seeds are "for local development only", so demo data on
  Supabase is maintained separately.

## Related

- [ADR 0006](0006-local-long-running-backend-idempotent-jobs.md)
- `README.md` (§3 Configure, "Team setup notes"), `.env.example`, `test/e2e-setup.ts`,
  `scripts/*.ts`, `.github/workflows/ci.yml`, `prisma/schema.prisma` (`directUrl`)
