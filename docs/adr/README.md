# Architecture Decision Records

Short records of significant decisions, one per file, in the Michael Nygard format
(Status, Date, Context, Decision, Consequences, Related). Numbering continues from `0001`.

- **Accepted**: in force, and the code follows it.
- **Proposed**: an open issue. It describes the current state and the options; nothing is decided yet.
- **Superseded by ADR NNNN**: kept for history.

`TODO(team)` marks rationale the code does not show. `⚠ Contradiction` notes at the top of an ADR
flag places where the code differs from what the decision says.

| # | Title | Status |
|---|---|---|
| [0001](0001-held-hard-blocks-at-db-level.md) | HELD hard-blocks at DB level; REQUESTED stays a soft warning | Accepted |
| [0002](0002-pending-bookings-hard-block.md) | Pending (REQUESTED) venue bookings hard-block like approved ones | Superseded by ADR 0003 |
| [0003](0003-pending-bookings-soft-warning.md) | Pending (REQUESTED) venue bookings give a soft overlap warning | Accepted |
| [0004](0004-awaiting-safety-check-status.md) | AWAITING_SAFETY_CHECK between Confirm Event and the Safety Officer check | Accepted |
| [0005](0005-local-db-shared-supabase-after-merge.md) | Develop against local Postgres; migrate shared Supabase only after merge to main | Accepted |
| [0006](0006-local-long-running-backend-idempotent-jobs.md) | Backend runs locally as a long-running process; scheduled jobs must be idempotent | Accepted |
| [0007](0007-db-level-overlap-constraints.md) | Overlap rules enforced at the database level with hand-written SQL | Accepted |
| [0008](0008-branching-and-module-ownership.md) | Per-story short-lived branches with module ownership | Accepted (to confirm) |
| [0009](0009-status-enum-growth.md) | Status enums have grown beyond the original spec | Proposed |
| [0010](0010-coordinator-manager-role-differentiation.md) | Manager role differentiation and per-event authority | Proposed |
| [0011](0011-accessibility-vocabulary.md) | Accessibility vocabulary for venue suitability matching | Proposed |
| [0012](0012-decision-audit-trail.md) | Audit trail for approval/rejection reasoning | Proposed |

## Adding an ADR

Copy the newest file, take the next number, and add a row above. Name story numbers as they appear
in [docs/BACKLOG.md](../BACKLOG.md). Where code labels a story differently (for example, overlap
detection is backlog #23 but `US-24` in code), say so in Related.
