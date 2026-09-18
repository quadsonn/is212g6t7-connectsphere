import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventRequest, EventStatus, Prisma, Role } from '@prisma/client';

import {
  ATTENDEE_VISIBLE_STATUSES,
  COORDINATOR_POOL_STATUSES,
} from '../../events/event-status.machine';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/jwt.strategy';
import { permissionScope } from './permission-matrix';
import { Action, Resource, Scope } from './permission.types';

/** US-10 AC-3 — the assigned Coordinator, resolved to contact details. */
export interface CoordinatorSummary {
  id: string;
  name: string;
  email: string;
}

/**
 * The registration-facing view of an event (AC-7). Everything omitted here —
 * expected attendance, layout notes, accessibility and equipment needs, who
 * the organiser is, internal timestamps — is planning information an
 * Attendee must not see.
 *
 * The assigned Coordinator IS included : "visible to any
 * authorised user viewing the event" is not qualified by role, and an
 * Attendee viewing the event is an authorised user of it.
 *
 * AMBIGUOUS: the split between "public" and "internal planning" is not
 * specified anywhere in the brief. This list is a starting point; treat it as
 * a question for the customer rather than a settled answer.
 */
export interface PublicEventView {
  id: string;
  // Nullable since US-04 made partial drafts storable. In practice an Attendee
  // only ever sees post-review events, which the EventRequest_complete_unless_draft
  // CHECK constraint guarantees are fully populated — but the type must match
  // the model rather than the happy path.
  name: string | null;
  purpose: string | null;
  description: string | null;
  proposedStart: Date | null;
  proposedEnd: Date | null;
  status: EventStatus;
  registrationEnabled: boolean;
  coordinator: CoordinatorSummary | null;
}

/** An EventRequest read with the coordinator relation resolved alongside it. */
export type EventWithCoordinator = EventRequest & {
  coordinator: CoordinatorSummary | null;
};

@Injectable()
export class AccessControlService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the grant, or throws. The scope it returns tells the caller which
   * records are in reach — callers must apply it, via scopedEventFilter() for
   * lists or assertEventAccess() for a single record.
   */
  requireScope(
    user: AuthenticatedUser,
    resource: Resource,
    action: Action,
  ): Scope {
    const scope = permissionScope(user.role as Role, resource, action);

    if (scope === null) {
      throw new ForbiddenException(
        `role ${user.role} may not ${action} ${resource}`,
      );
    }

    return scope;
  }

  /**
   * AC-5 / AC-6 — the reusable ownership filter the event stories call.
   *
   * Returns a Prisma `where` clause narrowing a list query to what this user
   * may see. Ownership is expressed as a query rather than a post-filter so
   * denied rows are never loaded, and pagination counts stay correct.
   */
  scopedEventFilter(
    user: AuthenticatedUser,
    action: Action = Action.READ,
  ): Prisma.EventRequestWhereInput {
    const scope = this.requireScope(user, Resource.EVENT, action);

    switch (scope) {
      case Scope.ANY:
        return {};
      case Scope.OWN:
        return { organiserId: user.userId };
      case Scope.ASSIGNED:
        // Events assigned to this Coordinator, plus the unassigned review
        // pool. Requests belonging to another Coordinator stay invisible.
        return {
          OR: [
            { coordinatorId: user.userId },
            {
              coordinatorId: null,
              status: { in: [...COORDINATOR_POOL_STATUSES] },
            },
          ],
        };
      case Scope.PUBLIC:
        return { status: { in: [...ATTENDEE_VISIBLE_STATUSES] } };
    }
  }

  /**
   * AC-5 / AC-6 — single-record ownership check, for the event stories to
   * call before reading or mutating an EventRequest.
   *
   * Denial is reported as 404, not 403: telling an Organiser that event X
   * exists but belongs to someone else leaks the existence of other teams'
   * events. AMBIGUOUS — the brief says "others return denied" without saying
   * which. Switch to ForbiddenException if the customer prefers explicitness.
   */
  async assertEventAccess(
    user: AuthenticatedUser,
    eventId: string,
    action: Action = Action.READ,
  ): Promise<EventWithCoordinator> {
    const filter = this.scopedEventFilter(user, action);

    const event = await this.prisma.eventRequest.findFirst({
      where: { AND: [{ id: eventId }, filter] },
      // US-10 AC-3: the assigned Coordinator travels with every single-record
      // read, so the main point of contact is identifiable wherever an event
      // is opened.
      include: { coordinator: { select: { id: true, name: true, email: true } } },
    });

    if (!event) {
      throw new NotFoundException('event request not found');
    }

    return event;
  }

  /** True when this user is the Organiser who raised the request. */
  isOwner(user: AuthenticatedUser, event: EventRequest): boolean {
    return event.organiserId === user.userId;
  }

  /** True when this user is the Coordinator the event is assigned to. */
  isAssignedCoordinator(
    user: AuthenticatedUser,
    event: EventRequest,
  ): boolean {
    return event.coordinatorId !== null && event.coordinatorId === user.userId;
  }

  /**
   * AC-7. Projects an event down to the registration-facing fields when the
   * caller's grant is PUBLIC; full record otherwise.
   *
   * The coordinator relation must already be resolved on `event` (as
   * assertEventAccess() and the COORDINATOR_SELECT-including list reads do) —
   * US-10 AC-3 requires it in the PUBLIC projection too, not just the full one.
   */
  projectEvent(
    user: AuthenticatedUser,
    event: EventWithCoordinator,
  ): EventWithCoordinator | PublicEventView {
    const scope = permissionScope(user.role as Role, Resource.EVENT, Action.READ);

    if (scope !== Scope.PUBLIC) {
      return event;
    }

    return {
      id: event.id,
      name: event.name,
      purpose: event.purpose,
      description: event.description,
      proposedStart: event.proposedStart,
      proposedEnd: event.proposedEnd,
      status: event.status,
      registrationEnabled: event.registrationEnabled,
      coordinator: event.coordinator,
    };
  }
}
