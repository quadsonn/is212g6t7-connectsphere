import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  BookingStatus,
  ChangeRequestStatus,
  Prisma,
  ReservationStatus,
} from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import {
  BookingsService,
  RescheduledBooking,
} from '../bookings/bookings.service';
import { rescheduleWindow, TimeWindow, windowMoved } from '../bookings/booking-reschedule';
import {
  computeItemAvailability,
  holdingReservationsWhere,
} from '../equipment/equipment-availability';
import {
  EquipmentReservationsService,
  ReleasedForReschedule,
  RELEASABLE_STATUSES,
} from '../equipment/equipment-reservations.service';
import { AttendeeChangeNotifier } from '../notifications/attendee-change-notifier.service';
import { scheduleChangesFrom } from '../notifications/event-schedule-change';
import { PrismaService } from '../prisma/prisma.service';
import {
  applicabilityErrors,
  capacityWarnings,
  isChangeable,
} from './change-request.rules';
import { RejectChangeRequestDto } from './dto/reject-change-request.dto';
import {
  describeRequirement,
  diffEventFields,
  FieldChange,
  sameValue,
  affectedArrangements,
} from './event-change.rules';
import { CHANGE_REQUEST_INCLUDE } from './events-change-request.service';
import { EventsService } from './events.service';

const REQUIREMENTS_ORDER: Prisma.EquipmentRequirementOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];

const ALREADY_DECIDED = 'this change request has already been decided';

/**
 * US-38 — what approving a date or time change does to the event's existing
 * arrangements: bookings move and wait for Venue Staff again, equipment
 * reservations are released for Technical Support to commit again.
 */
export interface RescheduleImpact {
  /** The event's window if approved; null when the request moves no dates. */
  newWindow: TimeWindow | null;
  venueBookings: {
    bookingId: string;
    venueName: string | null;
    status: BookingStatus;
    from: TimeWindow;
    to: TimeWindow;
  }[];
  equipmentReservations: {
    reservationId: string;
    equipmentType: string;
    quantity: number;
    status: ReservationStatus;
  }[];
}

/** A clash at the new time, shown before the Coordinator decides. */
export interface ImpactWarning {
  type: 'VENUE_CONFLICT' | 'VENUE_BLOCKED' | 'EQUIPMENT_UNAVAILABLE';
  message: string;
}

/** What an approval actually moved and released. */
export interface ReschedulingResult {
  venueBookings: RescheduledBooking[];
  equipmentReservations: ReleasedForReschedule[];
}

/**
 * US-38 — an Event Coordinator reviews the change requests Organisers submit
 * (US-37) and approves or rejects them.
 *
 * Scope is the events assigned to THIS Coordinator, strictly. The review
 * permission (EVENT/REVIEW, ASSIGNED) also reaches the unassigned pool for
 * ordinary requests; a change request is only ever raised on an event that has
 * been through review, and AC-1 says "assigned to them only", so anything else
 * is reported as not found.
 */
@Injectable()
export class EventsChangeReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly events: EventsService,
    private readonly bookings: BookingsService,
    private readonly reservations: EquipmentReservationsService,
    // Tells registered Attendees when an approval moves the date or time.
    @Optional() private readonly attendeeChanges?: AttendeeChangeNotifier,
  ) {}

  /** AC-1 — pending requests on this Coordinator's own events, oldest first. */
  async listPending(user: AuthenticatedUser) {
    this.access.requireScope(user, Resource.EVENT, Action.REVIEW);

    return this.prisma.eventChangeRequest.findMany({
      where: {
        status: ChangeRequestStatus.PENDING,
        event: { coordinatorId: user.userId },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        ...CHANGE_REQUEST_INCLUDE,
        requestedBy: { select: { id: true, name: true, email: true } },
        event: {
          select: {
            id: true,
            name: true,
            status: true,
            proposedStart: true,
            proposedEnd: true,
            expectedAttendance: true,
          },
        },
      },
    });
  }

  /**
   * AC-2 / AC-6 — one request for review: the event as it is now beside what
   * is proposed, the Organiser's reason, and any capacity warning.
   */
  async getForReview(user: AuthenticatedUser, requestId: string) {
    const { request, event } = await this.load(user, requestId);

    const [equipmentRequirements, bookings] = await Promise.all([
      this.prisma.equipmentRequirement.findMany({
        where: { eventId: event.id },
        orderBy: REQUIREMENTS_ORDER,
        select: { id: true, equipmentId: true, equipmentType: true, quantity: true },
      }),
      // A rejected booking holds nothing, so it cannot be outgrown.
      this.prisma.venueBooking.findMany({
        where: {
          eventId: event.id,
          status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] },
        },
        select: {
          id: true,
          status: true,
          start: true,
          end: true,
          venue: { select: { id: true, name: true, capacity: true } },
        },
      }),
    ]);

    const { impact, warnings: impactWarnings } = await this.assessReschedule(
      request,
      event,
      bookings,
    );

    return {
      request,
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
        proposedStart: event.proposedStart,
        proposedEnd: event.proposedEnd,
        expectedAttendance: event.expectedAttendance,
        equipmentRequirements,
      },
      warnings: [
        ...capacityWarnings(request.proposedAttendance, bookings),
        ...impactWarnings,
      ],
      impact,
    };
  }

  /**
   * What approving this request would do to the event's existing arrangements,
   * and whether those arrangements would still work at the new time. Shown
   * before the Coordinator decides, so a clash is known up front.
   *
   * Only a change to the event's dates or times has any effect on bookings and
   * reservations; otherwise there is nothing to report.
   */
  private async assessReschedule(
    request: {
      proposedStart: Date | null;
      proposedEnd: Date | null;
    },
    event: { id: string; proposedStart: Date | null; proposedEnd: Date | null },
    bookings: { id: string; status: BookingStatus; start: Date; end: Date; venue: { id: string; name: string | null } }[],
  ): Promise<{ impact: RescheduleImpact; warnings: ImpactWarning[] }> {
    const none = {
      impact: { newWindow: null, venueBookings: [], equipmentReservations: [] },
      warnings: [],
    };

    const window = this.newWindow(request, event);
    if (!window) return none;

    const warnings: ImpactWarning[] = [];

    const venueBookings = await Promise.all(
      bookings.map(async (booking) => {
        const to = rescheduleWindow(booking, window.from, window.to);

        // Same two questions bookings ask when a slot is requested: does a
        // confirmed booking hold it, and is it blocked out?
        const [clashes, blocks] = await Promise.all([
          this.prisma.venueBooking.findMany({
            where: {
              venueId: booking.venue.id,
              id: { not: booking.id },
              status: BookingStatus.APPROVED,
              start: { lt: to.end },
              end: { gt: to.start },
            },
            select: { event: { select: { name: true } } },
          }),
          this.prisma.venueBlock.findMany({
            where: {
              venueId: booking.venue.id,
              start: { lt: to.end },
              end: { gt: to.start },
            },
            select: { reason: true },
          }),
        ]);

        const venue = booking.venue.name ?? 'The booked venue';
        for (const clash of clashes) {
          warnings.push({
            type: 'VENUE_CONFLICT',
            message: `${venue} is already booked for "${clash.event.name ?? 'another event'}" at the new time.`,
          });
        }
        for (const block of blocks) {
          warnings.push({
            type: 'VENUE_BLOCKED',
            message: `${venue} is blocked out at the new time${block.reason ? ` (${block.reason})` : ''}.`,
          });
        }

        return {
          bookingId: booking.id,
          venueName: booking.venue.name,
          status: booking.status,
          from: { start: booking.start, end: booking.end },
          to,
        };
      }),
    );

    const held = await this.prisma.equipmentReservation.findMany({
      where: { eventId: event.id, status: { in: [...RELEASABLE_STATUSES] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        quantity: true,
        status: true,
        equipment: {
          select: { id: true, type: true, totalQuantity: true, operationalStatus: true },
        },
      },
    });

    const equipmentReservations = await Promise.all(
      held.map(async (reservation) => {
        const others = await this.prisma.equipmentReservation.findMany({
          where: {
            AND: [
              holdingReservationsWhere([reservation.equipment.id], window.to),
              { id: { not: reservation.id } },
            ],
          },
          select: { quantity: true, start: true, end: true },
        });

        const availability = computeItemAvailability({
          equipment: reservation.equipment,
          requestedQuantity: reservation.quantity,
          reservations: others,
          window: window.to,
        });
        if (!availability.fullyAvailable) {
          warnings.push({
            type: 'EQUIPMENT_UNAVAILABLE',
            message: `${reservation.quantity} × ${reservation.equipment.type} may not be available at the new time (${availability.availableQuantity} free).`,
          });
        }

        return {
          reservationId: reservation.id,
          equipmentType: reservation.equipment.type,
          quantity: reservation.quantity,
          status: reservation.status,
        };
      }),
    );

    return {
      impact: { newWindow: window.to, venueBookings, equipmentReservations },
      warnings,
    };
  }

  /**
   * The event's window before and after this request, or null when the request
   * does not move it. A request proposing only a start keeps the existing end,
   * and the other way round.
   */
  private newWindow(
    request: { proposedStart: Date | null; proposedEnd: Date | null },
    event: { proposedStart: Date | null; proposedEnd: Date | null },
  ): { from: TimeWindow; to: TimeWindow } | null {
    if (!event.proposedStart || !event.proposedEnd) return null;

    const from = { start: event.proposedStart, end: event.proposedEnd };
    const to = {
      start: request.proposedStart ?? event.proposedStart,
      end: request.proposedEnd ?? event.proposedEnd,
    };

    return windowMoved(from, to) ? { from, to } : null;
  }

  /**
   * AC-4 — approve: the event takes the proposed values, the request becomes
   * APPROVED, and the change goes into the event's history under the
   * Coordinator's name. All in one transaction, so a request is never marked
   * approved without the event having changed.
   *
   * Only the fields the request proposes are written. For equipment, only the
   * catalogue-linked lines are replaced (that is all a request can see); lines
   * not from the catalogue are left alone, and a line that stays keeps its notes.
   */
  async approve(user: AuthenticatedUser, requestId: string) {
    const { request, event } = await this.load(user, requestId);
    this.assertPending(request.status);

    if (!isChangeable(event.status)) {
      throw new ConflictException(
        `event is ${event.status}; a change can no longer be applied to it — reject the request instead`,
      );
    }

    const problems = applicabilityErrors(
      { proposedStart: event.proposedStart, proposedEnd: event.proposedEnd },
      { proposedStart: request.proposedStart, proposedEnd: request.proposedEnd },
      new Date(),
    );
    if (problems.length > 0) {
      throw new ConflictException(
        problems.map((problem) => `cannot approve: ${problem}; reject the request instead`),
      );
    }

    const confirmed = await this.events.confirmedArrangements(event.id);
    const decidedAt = new Date();

    const approved = await this.prisma.$transaction(async (tx) => {
      // Claim the request first: a second Coordinator action racing this one
      // finds it no longer PENDING and stops here, rolling nothing forward.
      const claimed = await tx.eventChangeRequest.updateMany({
        where: { id: request.id, status: ChangeRequestStatus.PENDING },
        data: {
          status: ChangeRequestStatus.APPROVED,
          decidedById: user.userId,
          decidedAt,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException(ALREADY_DECIDED);
      }

      const before = await tx.eventRequest.findUniqueOrThrow({
        where: { id: event.id },
      });

      const changes: FieldChange[] = diffEventFields(before, {
        proposedStart: request.proposedStart ?? undefined,
        proposedEnd: request.proposedEnd ?? undefined,
        expectedAttendance: request.proposedAttendance ?? undefined,
      });

      if (changes.length > 0) {
        await tx.eventRequest.update({
          where: { id: event.id },
          data: {
            ...(request.proposedStart ? { proposedStart: request.proposedStart } : {}),
            ...(request.proposedEnd ? { proposedEnd: request.proposedEnd } : {}),
            ...(request.proposedAttendance !== null
              ? { expectedAttendance: request.proposedAttendance }
              : {}),
          },
        });
      }

      // A new date or time moves the event's bookings and gives back its
      // equipment, in this same transaction (see the two methods for why).
      const arrangements: ReschedulingResult = {
        venueBookings: [],
        equipmentReservations: [],
      };
      const moved = this.newWindow(request, before);
      if (moved) {
        arrangements.venueBookings = await this.bookings.rescheduleForEventChange(
          tx,
          event.id,
          moved.from,
          moved.to,
        );
        arrangements.equipmentReservations =
          await this.reservations.releaseForRescheduledEvent(event.id, tx);
      }

      if (request.equipmentChanged) {
        const existing = await tx.equipmentRequirement.findMany({
          where: { eventId: event.id },
          orderBy: REQUIREMENTS_ORDER,
        });
        const notes = new Map(
          existing.filter((row) => row.equipmentId).map((row) => [row.equipmentId, row.notes]),
        );

        await tx.equipmentRequirement.deleteMany({
          where: { eventId: event.id, equipmentId: { not: null } },
        });
        if (request.equipment.length > 0) {
          await tx.equipmentRequirement.createMany({
            data: request.equipment.map((line) => ({
              eventId: event.id,
              equipmentId: line.equipmentId,
              equipmentType: line.equipment.type,
              quantity: line.quantity,
              notes: notes.get(line.equipmentId) ?? null,
            })),
          });
        }

        const after = await tx.equipmentRequirement.findMany({
          where: { eventId: event.id },
          orderBy: REQUIREMENTS_ORDER,
        });

        const previousLines = existing.map(describeRequirement);
        const nextLines = after.map(describeRequirement);
        if (!sameValue(previousLines, nextLines)) {
          changes.push({
            field: 'equipmentRequirements',
            previous: previousLines,
            next: nextLines,
          });
        }
      }

      // A request whose values the event already has changes nothing, and an
      // empty history entry would only be noise.
      const change =
        changes.length > 0
          ? await this.events.recordChange(
              tx,
              event.id,
              user.userId,
              changes,
              affectedArrangements(changes, confirmed),
            )
          : null;

      const decided = await tx.eventChangeRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: CHANGE_REQUEST_INCLUDE,
      });

      return { request: decided, change, arrangements };
    });

    // After the approval has committed: one notice per Attendee listing every
    // date/time field this approval changed. An approval that only changes the
    // attendance or equipment produces none.
    await this.attendeeChanges?.notifyRegisteredAttendees(
      event,
      scheduleChangesFrom(approved.change?.changes ?? []),
    );

    return approved;
  }

  /**
   * AC-3 / AC-5 — reject, with a reason the Organiser can read. The event is
   * not touched.
   */
  async reject(
    user: AuthenticatedUser,
    requestId: string,
    dto: RejectChangeRequestDto,
  ) {
    const { request } = await this.load(user, requestId);
    this.assertPending(request.status);

    const claimed = await this.prisma.eventChangeRequest.updateMany({
      where: { id: request.id, status: ChangeRequestStatus.PENDING },
      data: {
        status: ChangeRequestStatus.REJECTED,
        decidedById: user.userId,
        decidedAt: new Date(),
        decisionReason: dto.reason,
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException(ALREADY_DECIDED);
    }

    return this.prisma.eventChangeRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: CHANGE_REQUEST_INCLUDE,
    });
  }

  /**
   * The request and its event, for a Coordinator allowed to review it. A
   * request that does not exist, or whose event is not assigned to this
   * Coordinator, is the same 404 — whether it exists is not theirs to learn.
   */
  private async load(user: AuthenticatedUser, requestId: string) {
    const found = await this.prisma.eventChangeRequest.findUnique({
      where: { id: requestId },
      include: {
        ...CHANGE_REQUEST_INCLUDE,
        requestedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!found) {
      throw new NotFoundException('change request not found');
    }

    const event = await this.access.assertEventAccess(user, found.eventId, Action.REVIEW);
    if (!this.access.isAssignedCoordinator(user, event)) {
      throw new NotFoundException('change request not found');
    }

    return { request: found, event };
  }

  private assertPending(status: ChangeRequestStatus): void {
    if (status !== ChangeRequestStatus.PENDING) {
      throw new ConflictException(ALREADY_DECIDED);
    }
  }
}
