# ADR 0008 — Per-story short-lived branches, with module ownership per team member

- Status: Accepted (TODO(team): confirm. Git history does not match; see below)
- Date: TODO(team): confirm
- Story: none (team workflow)

> **⚠ Contradiction with git history.**
> - **Branches are mostly per person per sprint, not per story.** Branches are named
>   `sprintN-<member>` (for example `sprint4-lh`, `sprint4-pamika`, `Sprint4-RAYE`) and merged into
>   a sprint integration branch (`Sprint-1-MAIN`, `Sprint2-MAIN`, `Sprint3-MAIN`, `sprint4-main`),
>   then into `main`. Only a few story branches exist (`US-10`, `US-11`,
>   `feature/49-venue-buffer-times`). Several sprint branches still exist after merge.
> - **No module ownership is visible.** There is no `CODEOWNERS`. Commits to each module come from
>   several members (for example, five authors in `src/events`, four or more in `src/bookings` and
>   `src/equipment`).
> - Parallel branches added the same schema changes, so migrations use `IF NOT EXISTS` to coexist
>   (US-42/US-57 `AWAITING_SAFETY_CHECK`, US-43/US-54 `RELEASED`).
>
> TODO(team): is this the intended rule going forward, or a description of past practice?

## Context

Five team members add vertical slices (CLAUDE.md §3.5) in parallel to one NestJS codebase with
shared `schema.prisma` and migrations. TODO(team): confirm reasoning.

## Decision

As described by the team:

- One short-lived branch per story, merged by PR.
- Each member owns one or more modules and reviews changes to them.

What the repo does enforce: CI (`.github/workflows/ci.yml`) runs build, lint, unit and integration
tests on pushes and PRs to `Sprint3-MAIN`, `sprint4-main` and `main`.

## Consequences

- ➕ (If followed) small PRs that trace to one story, and a clear reviewer for each module.
- ➖ Shared files (`schema.prisma`, `events.service.ts`, the migration folder) cut across modules,
  so ownership still needs coordination. Two migrations with the same timestamp already exist
  (`20261022090000_*` ×3, `20261015090000_*` ×2).
- ➖ Long-lived per-person branches, as in the history, mean larger merges and duplicated migrations.

## Related

- `.github/workflows/ci.yml`, `docs/testing/CONVENTIONS.md` ("Branch & ownership")
- `prisma/migrations/20261015090000_us42_confirm_arrangements`, `20261018090000_us43_event_cancellation`
