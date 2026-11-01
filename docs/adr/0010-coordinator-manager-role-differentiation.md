# ADR 0010 — Manager role differentiation and per-event authority

- Status: Proposed
- Date: 2026-11-01
- Story: #2 Role-based access, #10 Assignment, #55/#56 Coordinator Lead, #61 Assign Tech Support

> **⚠ Contradiction with the issue as stated** ("no manager role differentiation; any Coordinator
> can act on any event"):
> - A manager role exists. `EVENT_COORDINATOR_LEAD` (Requirement Change #5, #55/#56) assigns and
>   reassigns events.
> - Coordinators are already limited to their own events. Every `EVENT_COORDINATOR` grant in
>   `permission-matrix.ts` is `Scope.ASSIGNED`, enforced in `scopedEventFilter()` as
>   `coordinatorId = user.userId`. Review actions also call `assertIsAssignedTo()`. An unassigned
>   request is invisible to every Coordinator.
> - Venue Staff decisions are limited to venues they manage (`venue.managedById = user.userId` in
>   `bookings.service.ts`, `booking-review.service.ts`, `holds.service.ts`).

## Context: what is actually still open

- **The Lead cannot act on events.** It only has `EVENT/ASSIGN` (ANY), deliberately with no
  `EVENT/READ`. It cannot review, approve or step in on an event, and has no override if the
  assigned Coordinator is unavailable, except by reassigning it.
- **Technical Support is unscoped.** `RESERVATION` CREATE/READ/DECIDE/UPDATE and `EQUIPMENT`
  UPDATE are `Scope.ANY`, so any Tech Support user can act on any event's equipment.
  #61 assigns Tech Support to events. TODO(team): confirm whether any service narrows actions to
  the assigned Tech Support user.
- **Safety Officer** has `SAFETY_REVIEW` DECIDE at ANY scope. There is no assignment.
- Each user still has exactly one role (CLAUDE.md §5). A Lead cannot also act as a Coordinator.

## Options (not decided)

1. **Status quo.** The Lead only assigns. Escalation happens through reassignment.
2. **Lead as supervisor.** Give the Lead read (and perhaps review) at ANY scope over Coordinator
   events, audited.
3. **Scope Tech Support (and/or Safety) by assignment**, using #61's assignment the way
   Coordinators use `coordinatorId`.
4. **Multiple roles per user**, so a Lead can also be a working Coordinator. This is a schema
   change.

## Consequences

To be filled in when an option is chosen. TODO(team).

## Related

- `src/common/access/permission-matrix.ts`, `src/common/access/access-control.service.ts`,
  `src/events/events-assignment.service.ts`, `src/equipment/technical-support-assignments.service.ts`
- `prisma/migrations/20261007090000_add_coordinator_lead_and_safety_officer_roles`,
  `20261012144838_lead_assignment_queue`
- Tests: `src/common/access/permission-matrix.spec.ts`, `src/common/access/access-control.service.spec.ts`
