import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventRequest, Prisma, Role } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import {
  AccessControlService,
  CoordinatorSummary,
} from '../common/access/access-control.service';
import { Action } from '../common/access/permission.types';
import { shortSlot } from '../bookings/slot-label';
import { PrismaService } from '../prisma/prisma.service';
import { AssignTechnicalSupportDto } from './dto/assign-technical-support.dto';
import { EventsService } from './events.service';
import {
  conflictingAssignments,
  NO_TECH_SUPPORT_AVAILABLE_MESSAGE,
  requiresTechnicalSupport,
  StaffAssignment,
  TECH_SUPPORT_ASSIGNABLE_STATUSES,
  TimeWindow,
} from './technical-support.rules';

const PERSON_SELECT = { id: true, name: true, email: true } as const;

/** One Technical Support member, as the assignment screen lists them. */
export interface StaffOption extends CoordinatorSummary {
  /** AC-2/AC-4: free for the event's date and time. */
  available: boolean;
  /** AC-2: the overlapping events that make them unavailable. */
  conflicts: StaffAssignment[];
}

/** US-61 — what the Coordinator's assignment screen shows. */
export interface TechnicalSupportAssignmentView {
  eventId: string;
  /** AC-1: the event has technical support needs recorded. */
  requiresTechnicalSupport: boolean;
  /** The event's status allows an assignment (planning onwards, not ended). */
  assignable: boolean;
  assignee: CoordinatorSummary | null;
  staff: StaffOption[];
  /** AC-4: nobody can be assigned for this date and time. */
  noneAvailable: boolean;
  /** AC-4: the message the screen shows when noneAvailable. */
  message: string | null;
}

/**
 * US-61 — the assigned Coordinator gives an event requiring on-site support
 * one Technical Support member to be responsible for it.
 *
 * Follows the Lead's Coordinator assignment (EventsAssignmentService): the
 * assignee is a column on the event, not a status change, so setStatus() is
 * not involved; each change goes into the event's history through
 * recordChange(). Unlike it, only the event's own Coordinator may act, and a
 * member already assigned to an overlapping event cannot be chosen (AC-2).
 */
@Injectable()
export class EventsTechnicalSupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly events: EventsService,
  ) {}

  /** AC-1/AC-2/AC-4 — the current assignee and who could be assigned. */
  async getAssignment(
    user: AuthenticatedUser,
    eventId: string,
  ): Promise<TechnicalSupportAssignmentView> {
    const event = await this.access.assertEventAccess(user, eventId, Action.READ);
    this.assertAssignedCoordinator(user, event);

    return this.buildView(this.prisma, event);
  }

  /**
   * AC-1 — record the member as assigned. AC-2: refused, naming the
   * overlapping event, when they are already assigned to one. AC-4: refused
   * with the "no one available" message when nobody is free.
   *
   * The event and the member are row-locked for the transaction, so two
   * Coordinators assigning the same member to overlapping events run one at a
   * time: the second sees the first's assignment as a conflict.
   */
  async assign(
    user: AuthenticatedUser,
    eventId: string,
    dto: AssignTechnicalSupportDto,
  ): Promise<TechnicalSupportAssignmentView> {
    const event = await this.access.assertEventAccess(user, eventId, Action.UPDATE);
    this.assertAssignedCoordinator(user, event);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "EventRequest" WHERE "id" = ${eventId} FOR UPDATE`;
      // Re-read under the lock: the status or time may have changed.
      const current = await tx.eventRequest.findUniqueOrThrow({ where: { id: eventId } });
      const window = this.assertCanAssign(current);

      const target = await this.assertIsTechnicalSupport(tx, dto.staffId);
      if (current.technicalSupportId === target.id) {
        throw new BadRequestException(
          `choose a different member — ${target.name} is already assigned to this event`,
        );
      }
      await tx.$queryRaw`
        SELECT "id" FROM "User" WHERE "id" = ${target.id} FOR UPDATE`;

      const staff = await this.staffOptions(tx, current.id, window);

      // AC-4 before AC-2: when nobody is free, the chosen member is not
      // either, and the screen should say so rather than name one clash.
      if (!staff.some((option) => option.available)) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: NO_TECH_SUPPORT_AVAILABLE_MESSAGE,
          noneAvailable: true,
          conflicts: [],
        });
      }

      const chosen = staff.find((option) => option.id === target.id)!;
      if (!chosen.available) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: `${target.name} is already assigned to ${chosen.conflicts
            .map((c) => `"${c.name ?? 'an event'}" (${shortSlot(c.start, c.end)})`)
            .join(', ')}, which overlaps this event`,
          noneAvailable: false,
          conflicts: chosen.conflicts,
        });
      }

      const previous = current.technicalSupportId
        ? await tx.user.findUnique({ where: { id: current.technicalSupportId }, select: { name: true } })
        : null;

      await tx.eventRequest.update({
        where: { id: current.id },
        data: { technicalSupportId: target.id },
      });

      await this.events.recordChange(
        tx,
        current.id,
        user.userId,
        [{ field: 'technicalSupport', previous: previous?.name ?? null, next: target.name }],
        [],
      );
    });

    return this.getAssignment(user, eventId);
  }

  /** Take the assignee off the event; the member is free for its time again. */
  async unassign(
    user: AuthenticatedUser,
    eventId: string,
  ): Promise<TechnicalSupportAssignmentView> {
    const event = await this.access.assertEventAccess(user, eventId, Action.UPDATE);
    this.assertAssignedCoordinator(user, event);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "EventRequest" WHERE "id" = ${eventId} FOR UPDATE`;
      const current = await tx.eventRequest.findUniqueOrThrow({
        where: { id: eventId },
        include: { technicalSupport: { select: { name: true } } },
      });

      if (!TECH_SUPPORT_ASSIGNABLE_STATUSES.includes(current.status)) {
        throw new ConflictException(
          `the technical support assignment cannot be changed while the event is ${current.status}`,
        );
      }
      if (!current.technicalSupport) {
        throw new ConflictException('no Technical Support member is assigned to this event');
      }

      await tx.eventRequest.update({
        where: { id: current.id },
        data: { technicalSupportId: null },
      });

      await this.events.recordChange(
        tx,
        current.id,
        user.userId,
        [{ field: 'technicalSupport', previous: current.technicalSupport.name, next: null }],
        [],
      );
    });

    return this.getAssignment(user, eventId);
  }

  /** Role alone is not enough (CLAUDE.md §6): it must be this event's Coordinator. */
  private assertAssignedCoordinator(user: AuthenticatedUser, event: EventRequest): void {
    if (!this.access.isAssignedCoordinator(user, event)) {
      throw new ForbiddenException(
        'only the assigned coordinator may assign technical support to this event',
      );
    }
  }

  /** AC-1's precondition, and a status and window to assign against. */
  private assertCanAssign(event: EventRequest): TimeWindow {
    if (!requiresTechnicalSupport(event)) {
      throw new ConflictException(
        'this event does not require technical support — record its technical support needs first',
      );
    }
    if (!TECH_SUPPORT_ASSIGNABLE_STATUSES.includes(event.status)) {
      throw new ConflictException(
        `technical support cannot be assigned while the event is ${event.status}`,
      );
    }
    // Unreachable once submitted (the completeness CHECK guarantees both).
    if (!event.proposedStart || !event.proposedEnd) {
      throw new ConflictException('the event has no date and time to assign for');
    }
    return { start: event.proposedStart, end: event.proposedEnd };
  }

  /** The target must exist and hold the role, or the assignment means nothing. */
  private async assertIsTechnicalSupport(
    tx: Prisma.TransactionClient,
    staffId: string,
  ): Promise<{ id: string; name: string }> {
    const target = await tx.user.findUnique({
      where: { id: staffId },
      select: { id: true, name: true, role: true },
    });

    if (!target) {
      throw new NotFoundException('technical support staff member not found');
    }
    if (target.role !== Role.TECHNICAL_SUPPORT_STAFF) {
      throw new BadRequestException(
        'the assigned user must have the TECHNICAL_SUPPORT_STAFF role',
      );
    }
    return target;
  }

  private async buildView(
    client: Prisma.TransactionClient | PrismaService,
    event: EventRequest,
  ): Promise<TechnicalSupportAssignmentView> {
    const requires = requiresTechnicalSupport(event);
    const assignable = TECH_SUPPORT_ASSIGNABLE_STATUSES.includes(event.status);
    const window =
      event.proposedStart && event.proposedEnd
        ? { start: event.proposedStart, end: event.proposedEnd }
        : null;

    const [assignee, staff] = await Promise.all([
      event.technicalSupportId
        ? client.user.findUnique({ where: { id: event.technicalSupportId }, select: PERSON_SELECT })
        : null,
      window ? this.staffOptions(client, event.id, window) : [],
    ]);

    const noneAvailable = requires && assignable && !staff.some((option) => option.available);

    return {
      eventId: event.id,
      requiresTechnicalSupport: requires,
      assignable,
      assignee,
      staff,
      noneAvailable,
      message: noneAvailable ? NO_TECH_SUPPORT_AVAILABLE_MESSAGE : null,
    };
  }

  /**
   * Every Technical Support member, with the overlapping events they already
   * hold. The schema has no deactivation flag, so every account with the role
   * counts, as for the Lead's Coordinator list.
   */
  private async staffOptions(
    client: Prisma.TransactionClient | PrismaService,
    eventId: string,
    window: TimeWindow,
  ): Promise<StaffOption[]> {
    const members = await client.user.findMany({
      where: { role: Role.TECHNICAL_SUPPORT_STAFF },
      select: {
        ...PERSON_SELECT,
        technicalSupportEvents: {
          where: {
            id: { not: eventId },
            status: { in: [...TECH_SUPPORT_ASSIGNABLE_STATUSES] },
            proposedStart: { lt: window.end },
            proposedEnd: { gt: window.start },
          },
          select: { id: true, name: true, proposedStart: true, proposedEnd: true },
          orderBy: [{ proposedStart: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return members.map(({ technicalSupportEvents, ...person }) => {
      const conflicts = conflictingAssignments(
        eventId,
        window,
        technicalSupportEvents.flatMap((e) =>
          e.proposedStart && e.proposedEnd
            ? [{ eventId: e.id, name: e.name, start: e.proposedStart, end: e.proposedEnd }]
            : [],
        ),
      );
      return { ...person, available: conflicts.length === 0, conflicts };
    });
  }
}
