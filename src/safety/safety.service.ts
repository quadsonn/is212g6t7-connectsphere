import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConfirmedArrangement,
  EventStatus,
  NotificationType,
  Prisma,
  SafetyOutcome,
  SafetyReturnStage,
} from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource, Scope } from '../common/access/permission.types';
import { BookingsService } from '../bookings/bookings.service';
import { SAFETY_CHECK_ELIGIBLE_STATUSES } from '../events/event-status.machine';
import { EventsService } from '../events/events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SafetyCheckNotifier } from '../notifications/safety-check-notifier.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResubmitSafetyDto } from './dto/resubmit-safety.dto';
import { SafetyDecisionDto } from './dto/safety-decision.dto';
import { SafetyReadinessService } from './safety-readiness.service';
import { NotReadyReason } from './safety-readiness.rules';

const PERSON_SELECT = { id: true, name: true, email: true } as const;

/** One safety review as shown in a history, with who made it. */
const REVIEW_INCLUDE = {
  officer: { select: PERSON_SELECT },
} as const satisfies Prisma.SafetyReviewInclude;

export type SafetyReviewView = Prisma.SafetyReviewGetPayload<{
  include: typeof REVIEW_INCLUDE;
}>;

/** One row of the Safety Officer's queue. */
export interface SafetyQueueEntry {
  id: string;
  name: string | null;
  coordinator: { id: string; name: string; email: string } | null;
  expectedAttendance: number | null;
  proposedStart: Date | null;
  venues: { name: string | null; capacity: number | null }[];
  /** When the event entered the queue; the longest-waiting is listed first. */
  queuedAt: Date | null;
  /** Earlier checks of this event; above zero means this is a re-check. */
  previousReviews: number;
  lastOutcome: SafetyOutcome | null;
}

/** Everything the Safety Officer needs in front of them to decide. */
export interface SafetyReviewPacket {
  event: {
    id: string;
    name: string | null;
    purpose: string | null;
    category: string | null;
    status: EventStatus;
    proposedStart: Date | null;
    proposedEnd: Date | null;
    /** AC-2: the headcount the venues are judged against. */
    expectedAttendance: number | null;
    /** AC-2: the requested layout. */
    preferredLayout: string | null;
    layoutNotes: string | null;
    /** AC-2: accessibility requirements. */
    accessibilityRequirements: string[];
    accessibilityNotes: string | null;
    equipmentNeeds: string | null;
    technicalSupportNeeds: string | null;
    coordinator: { id: string; name: string; email: string } | null;
    organiser: { id: string; name: string; email: string };
  };
  /** AC-2: each booked venue with its capacity, restrictions and blocks. */
  venues: {
    bookingId: string;
    start: Date;
    end: Date;
    venue: {
      id: string;
      name: string | null;
      location: string | null;
      capacity: number | null;
      supportedLayouts: string[];
      accessibilityFeatures: string[];
      layoutNotes: string | null;
      /** Standing restrictions, as the venue describes its operation. */
      operatingInfo: string | null;
    };
    /** Spare places once the expected attendance is seated; negative is over. */
    capacityMargin: number | null;
    /** Blocked-out periods on the venue that overlap this booking. */
    blocks: { id: string; start: Date; end: Date; reason: string }[];
  }[];
  /** AC-2: requested equipment, and what is reserved against it. */
  equipment: {
    requirements: {
      equipmentId: string | null;
      equipmentType: string;
      quantity: number;
      notes: string | null;
    }[];
    reservations: {
      id: string;
      equipmentType: string;
      quantity: number;
      start: Date;
      end: Date;
    }[];
  };
  /** Earlier checks of this event, oldest first. */
  history: SafetyReviewView[];
}

export type SafetyDecisionResult = SafetyReviewView & {
  /** The status the event moved to as a result. */
  eventStatus: EventStatus;
};

/** Why an event is not ready for a check, in words for the Coordinator. */
const NOT_READY_MESSAGES: Record<NotReadyReason, string> = {
  NO_APPROVED_VENUE: 'no venue booking is approved',
  VENUE_BOOKING_PENDING: 'a venue booking is still pending',
  EQUIPMENT_NOT_RESERVED: 'requested equipment is not fully reserved',
};

/** Where each outcome sends the event. */
const NEXT_STATUS: Record<SafetyOutcome, EventStatus> = {
  [SafetyOutcome.APPROVED]: EventStatus.CONFIRMED,
  [SafetyOutcome.CHANGES_REQUESTED]: EventStatus.PLANNING,
  [SafetyOutcome.REJECTED]: EventStatus.SAFETY_REJECTED,
};

/**
 * Requirement change 6 — the Safety Officer's queue, review and decision.
 *
 * Authorisation is the permission matrix's SAFETY_REVIEW resource (the Safety
 * Officer reads everything and alone decides; a Coordinator reads the history
 * of events they coordinate). Status changes go through EventsService.setStatus.
 */
@Injectable()
export class SafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly events: EventsService,
    private readonly bookings: BookingsService,
    private readonly readiness: SafetyReadinessService,
    private readonly notifications: NotificationsService,
    private readonly safetyChecks: SafetyCheckNotifier,
  ) {}

  /** AC-1: events whose arrangements are confirmed and await a check. */
  async listQueue(user: AuthenticatedUser): Promise<SafetyQueueEntry[]> {
    this.access.requireScope(user, Resource.SAFETY_REVIEW, Action.READ);

    // Pull in anything that became due without a signal, and out anything that
    // stopped being due, before listing.
    await this.readiness.syncAll();

    const rows = await this.prisma.eventRequest.findMany({
      where: { status: EventStatus.AWAITING_SAFETY_CHECK },
      orderBy: [{ safetyQueuedAt: 'asc' }, { id: 'asc' }],
      include: {
        coordinator: { select: PERSON_SELECT },
        venueBookings: {
          where: { status: 'APPROVED' },
          orderBy: { start: 'asc' },
          select: { venue: { select: { name: true, capacity: true } } },
        },
        safetyReviews: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { outcome: true },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      coordinator: row.coordinator,
      expectedAttendance: row.expectedAttendance,
      proposedStart: row.proposedStart,
      venues: row.venueBookings.map((b) => b.venue),
      queuedAt: row.safetyQueuedAt,
      previousReviews: row.safetyReviews.length,
      lastOutcome: row.safetyReviews[0]?.outcome ?? null,
    }));
  }

  /** AC-2: the facts of one queued event. */
  async getPacket(
    user: AuthenticatedUser,
    eventId: string,
  ): Promise<SafetyReviewPacket> {
    this.access.requireScope(user, Resource.SAFETY_REVIEW, Action.READ);
    await this.readiness.syncEvent(eventId);

    const event = await this.prisma.eventRequest.findFirst({
      where: { id: eventId, status: EventStatus.AWAITING_SAFETY_CHECK },
      include: {
        coordinator: { select: PERSON_SELECT },
        organiser: { select: PERSON_SELECT },
        venueBookings: {
          where: { status: 'APPROVED' },
          orderBy: { start: 'asc' },
          include: { venue: true },
        },
        equipmentRequirements: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        equipmentReservations: {
          where: { status: 'APPROVED' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { equipment: { select: { type: true } } },
        },
        safetyReviews: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: REVIEW_INCLUDE,
        },
      },
    });

    if (!event) {
      throw new NotFoundException('event is not awaiting a safety check');
    }

    const venues = await Promise.all(
      event.venueBookings.map(async (booking) => {
        const blocks = await this.bookings.findOverlappingBlocks(
          this.prisma,
          booking.venueId,
          booking.start,
          booking.end,
        );

        return {
          bookingId: booking.id,
          start: booking.start,
          end: booking.end,
          venue: {
            id: booking.venue.id,
            name: booking.venue.name,
            location: booking.venue.location,
            capacity: booking.venue.capacity,
            supportedLayouts: booking.venue.supportedLayouts,
            accessibilityFeatures: booking.venue.accessibilityFeatures,
            layoutNotes: booking.venue.layoutNotes,
            operatingInfo: booking.venue.operatingInfo,
          },
          capacityMargin:
            booking.venue.capacity !== null && event.expectedAttendance !== null
              ? booking.venue.capacity - event.expectedAttendance
              : null,
          blocks: blocks.flatMap((block) =>
            block.blockId && block.start && block.end
              ? [
                  {
                    id: block.blockId,
                    start: block.start,
                    end: block.end,
                    reason: block.reason ?? '',
                  },
                ]
              : [],
          ),
        };
      }),
    );

    return {
      event: {
        id: event.id,
        name: event.name,
        purpose: event.purpose,
        category: event.category,
        status: event.status,
        proposedStart: event.proposedStart,
        proposedEnd: event.proposedEnd,
        expectedAttendance: event.expectedAttendance,
        preferredLayout: event.preferredLayout,
        layoutNotes: event.layoutNotes,
        accessibilityRequirements: event.accessibilityRequirements,
        accessibilityNotes: event.accessibilityNotes,
        equipmentNeeds: event.equipmentNeeds,
        technicalSupportNeeds: event.technicalSupportNeeds,
        coordinator: event.coordinator,
        organiser: event.organiser,
      },
      venues,
      equipment: {
        requirements: event.equipmentRequirements.map((r) => ({
          equipmentId: r.equipmentId,
          equipmentType: r.equipmentType,
          quantity: r.quantity,
          notes: r.notes,
        })),
        reservations: event.equipmentReservations.map((r) => ({
          id: r.id,
          equipmentType: r.equipment.type,
          quantity: r.quantity,
          start: r.start,
          end: r.end,
        })),
      },
      history: event.safetyReviews,
    };
  }

  /**
   * Record the decision. Only the Safety Officer can (SAFETY_REVIEW/DECIDE).
   *
   * One transaction, under a lock on the event: the review row and the status
   * change land together or not at all, and two Officers deciding the same
   * event cannot both succeed.
   *
   *  - APPROVED: CONFIRMED, the only way there.
   *  - CHANGES_REQUESTED: back to PLANNING, to the Coordinator, with the stage
   *    (venue or technical) to rework recorded and flagged on the review.
   *  - REJECTED: SAFETY_REJECTED, out of the queue and blocked, to the
   *    Coordinator. The whole plan is flagged.
   *
   * Nothing is un-approved or released: the Coordinator works from what is
   * there, changes what the Safety Officer objected to, and resubmits. Until
   * they do, the event stays out of the queue: only Confirm (US-42) or a
   * resubmit puts it back, and a resubmit needs a change, so an unchanged event
   * cannot bounce straight back.
   */
  async decide(
    user: AuthenticatedUser,
    eventId: string,
    dto: SafetyDecisionDto,
  ): Promise<SafetyDecisionResult> {
    this.access.requireScope(user, Resource.SAFETY_REVIEW, Action.DECIDE);

    const { review, event, nextStatus } = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "EventRequest" WHERE "id" = ${eventId} FOR UPDATE`;
        if (locked.length === 0) {
          throw new NotFoundException('event not found');
        }

        const event = await tx.eventRequest.findUniqueOrThrow({
          where: { id: eventId },
        });

        // Also what stops a second decision: the first one moved the event on.
        if (event.status !== EventStatus.AWAITING_SAFETY_CHECK) {
          throw new ConflictException(
            `a safety decision can only be recorded while the event awaits a safety check; it is ${event.status}`,
          );
        }

        // Never decide on arrangements that have stopped being confirmed.
        if (!(await this.readiness.evaluate(eventId, tx)).ready) {
          throw new ConflictException(
            'the event’s arrangements are no longer all confirmed, so it cannot be checked yet',
          );
        }

        const affected = this.flaggedArrangements(dto);

        const review = await tx.safetyReview.create({
          data: {
            eventId,
            officerId: user.userId,
            outcome: dto.outcome,
            reason: dto.outcome === SafetyOutcome.APPROVED ? null : dto.reason ?? null,
            returnStage:
              dto.outcome === SafetyOutcome.CHANGES_REQUESTED
                ? dto.returnStage ?? null
                : null,
            emergencyAccessComment: dto.emergencyAccessComment || null,
            crowdMovementComment: dto.crowdMovementComment || null,
            equipmentPlacementComment: dto.equipmentPlacementComment || null,
            accessibilityComment: dto.accessibilityComment || null,
            affectedArrangements: affected,
          },
          include: REVIEW_INCLUDE,
        });

        // Approval is checked again inside setStatus against the row above.
        const nextStatus = NEXT_STATUS[dto.outcome];
        await this.events.setStatus(event, nextStatus, tx);

        return { review, event, nextStatus };
      },
    );

    await this.notifyCoordinator(event, review);

    return { ...review, eventStatus: nextStatus };
  }

  /** Earlier checks of an event, oldest first; every one is kept. */
  async getHistory(
    user: AuthenticatedUser,
    eventId: string,
  ): Promise<SafetyReviewView[]> {
    const scope = this.access.requireScope(
      user,
      Resource.SAFETY_REVIEW,
      Action.READ,
    );

    if (scope === Scope.ASSIGNED) {
      // A Coordinator sees the history of events assigned to them only.
      await this.access.assertEventAccess(user, eventId, Action.READ);
    } else {
      const exists = await this.prisma.eventRequest.findUnique({
        where: { id: eventId },
        select: { id: true },
      });
      if (!exists) {
        throw new NotFoundException('event not found');
      }
    }

    return this.prisma.safetyReview.findMany({
      where: { eventId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: REVIEW_INCLUDE,
    });
  }

  /**
   * The arrangements the review asks the Coordinator to revisit, recorded on
   * the review: the one the chosen stage names, or both for a rejection, which
   * finds the plan as a whole unsafe.
   */
  private flaggedArrangements(dto: SafetyDecisionDto): ConfirmedArrangement[] {
    if (dto.outcome === SafetyOutcome.APPROVED) {
      return [];
    }

    if (dto.outcome === SafetyOutcome.REJECTED) {
      return [
        ConfirmedArrangement.VENUE_BOOKING,
        ConfirmedArrangement.EQUIPMENT_RESERVATION,
      ];
    }

    return dto.returnStage === SafetyReturnStage.VENUE
      ? [ConfirmedArrangement.VENUE_BOOKING]
      : [ConfirmedArrangement.EQUIPMENT_RESERVATION];
  }

  /**
   * The Coordinator answers the Safety Officer's feedback by sending the event
   * back for a new check.
   *
   * Refused unless the event is the Coordinator's, is being planned (a rejected
   * event must be resumed first), the latest review is unanswered feedback, the
   * arrangements are confirmed again, and something has actually changed since
   * that review. The last rule is what keeps "changes made" meaningful: an
   * unchanged event is not sent back to the Safety Officer.
   *
   * The Coordinator may add a comment for the Safety Officer; it is stored on
   * the review it answers, so it appears in the history beside the feedback.
   */
  async resubmit(
    user: AuthenticatedUser,
    eventId: string,
    dto: ResubmitSafetyDto = {},
  ): Promise<{ eventStatus: EventStatus }> {
    this.access.requireScope(user, Resource.SAFETY_REVIEW, Action.SUBMIT);
    // 404 unless the event is assigned to this Coordinator.
    await this.access.assertEventAccess(user, eventId, Action.UPDATE);

    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "EventRequest" WHERE "id" = ${eventId} FOR UPDATE`;
      if (locked.length === 0) {
        throw new NotFoundException('event not found');
      }

      const event = await tx.eventRequest.findUniqueOrThrow({
        where: { id: eventId },
      });

      const latest = await tx.safetyReview.findFirst({
        where: { eventId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      if (
        !latest ||
        latest.outcome === SafetyOutcome.APPROVED ||
        latest.resubmittedAt !== null
      ) {
        throw new ConflictException(
          'there is no safety feedback waiting for a response on this event',
        );
      }

      if (event.status === EventStatus.SAFETY_REJECTED) {
        throw new ConflictException(
          'resume planning on this event before sending it back for a safety check',
        );
      }

      if (!SAFETY_CHECK_ELIGIBLE_STATUSES.includes(event.status)) {
        throw new ConflictException(
          `an event cannot be sent for a safety check while it is ${event.status}`,
        );
      }

      const readiness = await this.readiness.evaluate(eventId, tx);
      if (!readiness.ready) {
        throw new ConflictException(
          `the event’s arrangements are not all confirmed: ${readiness.reasons
            .map((reason) => NOT_READY_MESSAGES[reason])
            .join('; ')}`,
        );
      }

      if (!(await this.hasChangesSince(tx, eventId, latest.createdAt))) {
        throw new ConflictException(
          'nothing has changed since the Safety Officer’s review; update the plan before sending it back',
        );
      }

      await tx.safetyReview.update({
        where: { id: latest.id },
        data: {
          resubmittedAt: new Date(),
          // The Coordinator's note to the Safety Officer; blank means none.
          resubmissionComment: dto.comment || null,
        },
      });
      // US-42 AC-4: sending it back re-confirms the arrangements, so it
      // records who did it and when, as the Coordinator's Confirm does.
      return this.events.setStatus(
        event,
        EventStatus.AWAITING_SAFETY_CHECK,
        tx,
        user.userId,
      );
    });

    // US-64: back in the Safety queue. Raised after commit, so a failed
    // notification cannot undo the resubmission.
    await this.safetyChecks.notifyCheckDue(updated);

    return { eventStatus: updated.status };
  }

  /**
   * Has the Coordinator changed anything since the review? Any planning edit,
   * or any booking, booking decision, reservation or equipment requirement
   * created or touched after it counts.
   */
  private async hasChangesSince(
    tx: Prisma.TransactionClient,
    eventId: string,
    since: Date,
  ): Promise<boolean> {
    const after = { gt: since };
    const counts = await Promise.all([
      tx.eventChange.count({ where: { eventId, createdAt: after } }),
      tx.venueBooking.count({
        where: { eventId, OR: [{ createdAt: after }, { updatedAt: after }] },
      }),
      tx.bookingDecision.count({
        where: { booking: { eventId }, createdAt: after },
      }),
      tx.equipmentReservation.count({
        where: { eventId, OR: [{ createdAt: after }, { updatedAt: after }] },
      }),
      tx.equipmentRequirement.count({
        where: { eventId, OR: [{ createdAt: after }, { updatedAt: after }] },
      }),
    ]);

    return counts.some((count) => count > 0);
  }

  /** The Coordinator is told the outcome and, for anything but approval, why. */
  private async notifyCoordinator(
    event: { id: string; name: string | null; coordinatorId: string | null },
    review: SafetyReviewView,
  ): Promise<void> {
    if (!event.coordinatorId) return;

    // Short, like the other notices: the inbox shows the event beside it and
    // titles it "Safety check". The reason goes last, after " Reason: ", so
    // the inbox shows it on its own line (splitReason).
    const reason = review.reason ? ` Reason: ${review.reason}` : '';

    const message =
      review.outcome === SafetyOutcome.APPROVED
        ? 'Approved. The event is confirmed.'
        : review.outcome === SafetyOutcome.CHANGES_REQUESTED
          ? `Changes requested to the ${review.returnStage?.toLowerCase()} planning. Make them, then send it back for a safety check.${reason}`
          : `Rejected. Resume planning, rework it, then send it back for a safety check.${reason}`;

    await this.notifications.notifySafely({
      recipientId: event.coordinatorId,
      type: NotificationType.SAFETY_CHECK_DECIDED,
      message,
      relatedEventId: event.id,
    });
  }
}
