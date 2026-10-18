import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventStatus, NotificationType, Prisma, Role, User } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import {
  AccessControlService,
  CoordinatorSummary,
} from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignCoordinatorDto } from './dto/assign-coordinator.dto';
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  UNASSIGNED_QUEUE_STATUSES,
} from './event-status.machine';
import { EventsService } from './events.service';

/** The queue: no Coordinator yet, and submitted. */
const QUEUE_WHERE: Prisma.EventRequestWhereInput = {
  coordinatorId: null,
  status: { in: [...UNASSIGNED_QUEUE_STATUSES] },
};

const PERSON_SELECT = { id: true, name: true, email: true } as const;

/** One row of the unassigned queue. */
export interface QueueEntry {
  id: string;
  name: string | null;
  organiser: CoordinatorSummary;
  /** The Organiser's client organisation; null until one is recorded. */
  organisation: string | null;
  category: string | null;
  proposedStart: Date | null;
  proposedEnd: Date | null;
  expectedAttendance: number | null;
  submittedAt: Date | null;
}

/** A queued request opened for review before assigning. */
export interface QueuedRequestDetail extends QueueEntry {
  status: EventStatus;
  purpose: string | null;
  description: string | null;
  preferredLayout: string | null;
  layoutNotes: string | null;
}

/** One Coordinator and the active events they hold. */
export interface CoordinatorAssignments {
  coordinator: CoordinatorSummary;
  activeCount: number;
  events: {
    id: string;
    name: string | null;
    status: EventStatus;
    /** "Event date" — the proposed start. */
    eventDate: Date | null;
  }[];
}

/** What an assignment or reassignment returns. */
export interface AssignmentResult {
  id: string;
  name: string | null;
  status: EventStatus;
  coordinator: CoordinatorSummary;
}

/**
 * Event Coordinator Lead stories — the unassigned queue, assignment, and
 * supervising / reassigning. Every method is gated on EVENT/ASSIGN, which the
 * permission matrix grants to the Lead alone.
 *
 * Assignment is not a status change, as in US-10: the request stays SUBMITTED
 * until its Coordinator starts the review, so setStatus() is not involved.
 */
@Injectable()
export class EventsAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Oldest submission first; id breaks ties between identical timestamps. */
  async listQueue(user: AuthenticatedUser): Promise<QueueEntry[]> {
    this.access.requireScope(user, Resource.EVENT, Action.ASSIGN);

    const rows = await this.prisma.eventRequest.findMany({
      where: QUEUE_WHERE,
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      include: { organiser: { select: { ...PERSON_SELECT, organisation: true } } },
    });

    return rows.map((row) => this.toQueueEntry(row));
  }

  /** Open a queued request. A request that is not queued is not found. */
  async getQueuedRequest(
    user: AuthenticatedUser,
    id: string,
  ): Promise<QueuedRequestDetail> {
    this.access.requireScope(user, Resource.EVENT, Action.ASSIGN);

    const row = await this.prisma.eventRequest.findFirst({
      where: { AND: [{ id }, QUEUE_WHERE] },
      include: { organiser: { select: { ...PERSON_SELECT, organisation: true } } },
    });

    if (!row) {
      throw new NotFoundException('request not found in the unassigned queue');
    }

    return {
      ...this.toQueueEntry(row),
      status: row.status,
      purpose: row.purpose,
      description: row.description,
      preferredLayout: row.preferredLayout,
      layoutNotes: row.layoutNotes,
    };
  }

  /**
   * The Coordinators a request can be given to. The schema has no
   * deactivation flag, so "active" means every account holding the role.
   */
  async listCoordinators(user: AuthenticatedUser): Promise<CoordinatorSummary[]> {
    this.access.requireScope(user, Resource.EVENT, Action.ASSIGN);

    return this.prisma.user.findMany({
      where: { role: Role.EVENT_COORDINATOR },
      select: PERSON_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Assign a queued request to one Coordinator.
   *
   * A request that already has a Coordinator is refused with that
   * Coordinator named, so the Lead sees who holds it. The write is
   * conditional on the request still being unassigned, so two Leads racing on
   * the same request cannot both succeed.
   */
  async assign(
    user: AuthenticatedUser,
    eventId: string,
    dto: AssignCoordinatorDto,
  ): Promise<AssignmentResult> {
    const event = await this.access.assertEventAccess(user, eventId, Action.ASSIGN);

    if (event.coordinatorId !== null) {
      throw this.alreadyAssigned(event.coordinator);
    }

    if (!UNASSIGNED_QUEUE_STATUSES.includes(event.status)) {
      throw new NotFoundException('request not found in the unassigned queue');
    }

    const next = await this.assertIsCoordinator(dto.coordinatorId);

    const claimed = await this.prisma.$transaction(async (tx) => {
      if (!(await this.swapCoordinator(tx, event.id, null, next.id))) {
        return false;
      }

      await this.events.recordChange(
        tx,
        event.id,
        user.userId,
        [{ field: 'coordinator', previous: null, next: next.name }],
        [],
      );

      return true;
    });

    if (!claimed) {
      const current = await this.prisma.eventRequest.findUnique({
        where: { id: event.id },
        select: { coordinator: { select: PERSON_SELECT } },
      });
      throw this.alreadyAssigned(current?.coordinator ?? null);
    }

    // Raised after commit so a failed notification cannot undo the assignment.
    await this.notifications.notifySafely({
      recipientId: next.id,
      type: NotificationType.EVENT_ASSIGNED,
      message: `"${event.name ?? 'An event'}" has been assigned to you by ${await this.actorName(user)}.`,
      relatedEventId: event.id,
    });

    return this.toResult(event.id, event.name, event.status, next);
  }

  /**
   * Every Coordinator with the active events they hold, listed by name —
   * including those holding nothing, since the Lead is looking for spare
   * capacity. `coordinatorId` narrows the view to one Coordinator.
   */
  async listAssignments(
    user: AuthenticatedUser,
    coordinatorId?: string,
  ): Promise<CoordinatorAssignments[]> {
    this.access.requireScope(user, Resource.EVENT, Action.ASSIGN);

    if (coordinatorId !== undefined) {
      await this.assertIsCoordinator(coordinatorId);
    }

    const coordinators = await this.prisma.user.findMany({
      where: {
        role: Role.EVENT_COORDINATOR,
        ...(coordinatorId !== undefined ? { id: coordinatorId } : {}),
      },
      select: {
        ...PERSON_SELECT,
        coordinatedEvents: {
          where: { status: { in: [...ACTIVE_ASSIGNMENT_STATUSES] } },
          select: { id: true, name: true, status: true, proposedStart: true },
          orderBy: [{ proposedStart: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return coordinators.map(({ coordinatedEvents, ...coordinator }) => ({
      coordinator,
      activeCount: coordinatedEvents.length,
      events: coordinatedEvents.map((e) => ({
        id: e.id,
        name: e.name,
        status: e.status,
        eventDate: e.proposedStart,
      })),
    }));
  }

  /**
   * Hand an active event from its Coordinator to a different one.
   *
   * Only coordinatorId changes. Comments, bookings, reservations and history
   * hang off the event and stay as they are; pending change requests are read
   * through the event's coordinator, so they follow it to the new owner
   * without being touched. The change is recorded in the event's history and
   * both Coordinators are notified.
   */
  async reassign(
    user: AuthenticatedUser,
    eventId: string,
    dto: AssignCoordinatorDto,
  ): Promise<AssignmentResult> {
    const event = await this.access.assertEventAccess(user, eventId, Action.ASSIGN);
    const previous = event.coordinator;

    if (previous === null) {
      throw new ConflictException(
        'this request has no Coordinator yet — assign it from the unassigned queue',
      );
    }

    if (!ACTIVE_ASSIGNMENT_STATUSES.includes(event.status)) {
      throw new ConflictException(
        `an event cannot be reassigned while it is ${event.status}`,
      );
    }

    if (dto.coordinatorId === previous.id) {
      throw new BadRequestException(
        `choose a different coordinator — this event is already assigned to ${previous.name}`,
      );
    }

    const next = await this.assertIsCoordinator(dto.coordinatorId);

    const moved = await this.prisma.$transaction(async (tx) => {
      if (!(await this.swapCoordinator(tx, event.id, previous.id, next.id))) {
        return false;
      }

      await this.events.recordChange(
        tx,
        event.id,
        user.userId,
        [{ field: 'coordinator', previous: previous.name, next: next.name }],
        [],
      );

      return true;
    });

    if (!moved) {
      throw new ConflictException(
        'this event was reassigned by someone else — reload and try again',
      );
    }

    const eventName = event.name ?? 'an event';
    await this.notifications.notifySafely({
      recipientId: previous.id,
      type: NotificationType.EVENT_REASSIGNED,
      message: `"${eventName}" has been reassigned from you to ${next.name}.`,
      relatedEventId: event.id,
    });
    await this.notifications.notifySafely({
      recipientId: next.id,
      type: NotificationType.EVENT_REASSIGNED,
      message: `You are now the coordinator for "${eventName}", reassigned to you from ${previous.name} by ${await this.actorName(user)}.`,
      relatedEventId: event.id,
    });

    return this.toResult(event.id, event.name, event.status, next);
  }

  /**
   * The target must exist and hold the Coordinator role — otherwise an event
   * could be handed to an account that cannot see it.
   */
  private async assertIsCoordinator(userId: string): Promise<User> {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!target) {
      throw new NotFoundException('coordinator not found');
    }

    if (target.role !== Role.EVENT_COORDINATOR) {
      throw new BadRequestException(
        'the assigned user must have the EVENT_COORDINATOR role',
      );
    }

    return target;
  }

  /**
   * Moves the event from `from` to `to` only if `from` still holds it, so two
   * Leads acting on the same event cannot both succeed. Returns false when
   * someone got there first.
   *
   * `update` with a non-unique filter rather than `updateMany`: the status
   * audit forbids updateMany on EventRequest outright, and this write touches
   * coordinatorId only.
   */
  private async swapCoordinator(
    tx: Prisma.TransactionClient,
    eventId: string,
    from: string | null,
    to: string,
  ): Promise<boolean> {
    try {
      await tx.eventRequest.update({
        where: { id: eventId, coordinatorId: from },
        data: { coordinatorId: to },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return false;
      }
      throw error;
    }
  }

  private async actorName(user: AuthenticatedUser): Promise<string> {
    const actor = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { name: true },
    });

    return actor?.name ?? 'the Event Coordinator Lead';
  }

  private alreadyAssigned(current: CoordinatorSummary | null): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      message: current
        ? `this request is already assigned to ${current.name}`
        : 'this request is already assigned',
      currentAssignee: current,
    });
  }

  private toQueueEntry(
    row: Prisma.EventRequestGetPayload<{
      include: { organiser: { select: { id: true; name: true; email: true; organisation: true } } };
    }>,
  ): QueueEntry {
    const { organisation, ...organiser } = row.organiser;

    return {
      id: row.id,
      name: row.name,
      organiser,
      organisation,
      category: row.category,
      proposedStart: row.proposedStart,
      proposedEnd: row.proposedEnd,
      expectedAttendance: row.expectedAttendance,
      submittedAt: row.submittedAt,
    };
  }

  private toResult(
    id: string,
    name: string | null,
    status: EventStatus,
    coordinator: User,
  ): AssignmentResult {
    return {
      id,
      name,
      status,
      coordinator: {
        id: coordinator.id,
        name: coordinator.name,
        email: coordinator.email,
      },
    };
  }
}
