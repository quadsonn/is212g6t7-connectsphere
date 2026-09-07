import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventRequest, EventStatus, Prisma, Role } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/jwt.strategy';
import { permissionScope } from './permission-matrix';
import { Action, Resource, Scope } from './permission.types';

/**
 * Statuses an Attendee may see at all. Everything earlier is internal review
 * traffic, and REJECTED/CANCELLED events are not registration-facing.
 *
 * AMBIGUOUS: the brief says an Attendee sees "permitted event info" without
 * defining which events are visible. This is the narrowest reading that still
 * lets registration work.
 */
/**
 * Unassigned requests a Coordinator may pick up (US-03 AC-2).
 *
 * A freshly submitted request has no coordinatorId, so a strict "assigned to
 * me" scope would hide it from every Coordinator and no review could ever
 * start. CLAUDE.md §1 has Coordinators "review requests, assign/coordinate
 * events", which implies an unassigned pool they draw from.
 *
 * AMBIGUOUS: the alternative is auto-assigning a Coordinator at submission —
 * but the brief says nothing about who or by what rule, so the pool is the
 * smaller assumption.
 */
const COORDINATOR_POOL_STATUSES: EventStatus[] = [
  EventStatus.SUBMITTED,
  EventStatus.UNDER_REVIEW,
];

const ATTENDEE_VISIBLE_STATUSES: EventStatus[] = [
  EventStatus.APPROVED,
  EventStatus.PLANNING,
  EventStatus.CONFIRMED,
  EventStatus.COMPLETED,
];

/**
 * The registration-facing view of an event (AC-7). Everything omitted here —
 * expected attendance, layout notes, accessibility and equipment needs, who
 * the organiser and coordinator are, internal timestamps — is planning
 * information an Attendee must not see.
 *
 * AMBIGUOUS: the split between "public" and "internal planning" is not
 * specified anywhere in the brief. This list is a starting point; treat it as
 * a question for the customer rather than a settled answer.
 */
export interface PublicEventView {
  id: string;
  name: string;
  purpose: string;
  description: string;
  proposedStart: Date;
  proposedEnd: Date;
  status: EventStatus;
  registrationEnabled: boolean;
}

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
              status: { in: COORDINATOR_POOL_STATUSES },
            },
          ],
        };
      case Scope.PUBLIC:
        return { status: { in: ATTENDEE_VISIBLE_STATUSES } };
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
  ): Promise<EventRequest> {
    const filter = this.scopedEventFilter(user, action);

    const event = await this.prisma.eventRequest.findFirst({
      where: { AND: [{ id: eventId }, filter] },
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
   */
  projectEvent(
    user: AuthenticatedUser,
    event: EventRequest,
  ): EventRequest | PublicEventView {
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
    };
  }
}
