import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  BookingStatus,
  ChangeRequestStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import {
  BookingsService,
  isExclusionViolation,
  RebookedBooking,
} from '../bookings/bookings.service';
import { TimeWindow, windowMoved } from '../bookings/booking-reschedule';
import { VenueActivityNotifier } from '../bookings/venue-activity-notifier';
import {
  EquipmentReservationsService,
  RebookedReservation,
  RELEASABLE_STATUSES,
} from '../equipment/equipment-reservations.service';
import { AttendeeChangeNotifier } from '../notifications/attendee-change-notifier.service';
import { scheduleChangesFrom } from '../notifications/event-schedule-change';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ArrangementCheck,
  ArrangementSummaryItem,
  refusedApprovalMessage,
} from './change-arrangement-check';
import { ChangeArrangementCheckService } from './change-arrangement-check.service';
import { applicabilityErrors, isChangeable } from './change-request.rules';
import { RejectChangeRequestDto } from './dto/reject-change-request.dto';
import {
  describeRequirement,
  diffEventFields,
  FieldChange,
  sameValue,
  affectedArrangements,
  movedArrangementChanges,
} from './event-change.rules';
import { CHANGE_REQUEST_INCLUDE } from './events-change-request.service';
import { EventsService } from './events.service';
import { inEntryOrder } from '../prisma/readable-id';

const REQUIREMENTS_ORDER: Prisma.EquipmentRequirementOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];

const ALREADY_DECIDED = 'this change request has already been decided';

/**
 * US-48 AC-7/AC-8 — thrown inside the approval transaction when the re-run
 * check finds a conflict, so everything rolls back; approve() then refuses
 * with a 409 listing the conflicts and leaves the request pending.
 */
class ArrangementCheckFailed extends Error {
  constructor(readonly check: ArrangementCheck) {
    super('arrangement check failed');
  }
}

/**
 * US-48 — the approval waits on row locks (a US-32 commit, a booking decision),
 * so it gets the same limits as a commit rather than Prisma's 5s default.
 */
const APPROVAL_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;

/** Live bookings: still asking for or holding a venue. */
const LIVE_BOOKING_STATUSES: BookingStatus[] = [BookingStatus.REQUESTED, BookingStatus.APPROVED];

/**
 * US-48 AC-7 — what an approval rebooked for the new details. Each original
 * was released once its replacement existed, and is linked to it.
 */
export interface ReschedulingResult {
  venueBookings: RebookedBooking[];
  equipmentReservations: RebookedReservation[];
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
    private readonly arrangements: ChangeArrangementCheckService,
    private readonly notifications: NotificationsService,
    // US-40: tells a venue's manager when an approved booking changes.
    private readonly venueActivity: VenueActivityNotifier,
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
   *
   * US-48 AC-1..AC-4, AC-6: with the check of the event's arrangements against
   * the proposed details — what still works, what would conflict and why, and
   * what approval would move. Read-only: opening a request changes nothing.
   * The capacity warning (`warnings`) comes from the same check.
   */
  async getForReview(user: AuthenticatedUser, requestId: string) {
    const { request, event } = await this.load(user, requestId);

    const [requirementRows, check] = await Promise.all([
      this.prisma.equipmentRequirement.findMany({
        where: { eventId: event.id },
        orderBy: REQUIREMENTS_ORDER,
        select: { id: true, createdAt: true, equipmentId: true, equipmentType: true, quantity: true },
      }),
      this.arrangements.check(this.prisma, request, event),
    ]);
    // In the order they were listed (readable IDs past 999 sort wrong as text).
    const equipmentRequirements = inEntryOrder(requirementRows).map(
      ({ createdAt: _createdAt, ...row }) => row,
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
      warnings: check.warnings,
      check,
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

    let approved: Awaited<ReturnType<typeof this.applyApproval>>;
    try {
      approved = await this.prisma.$transaction(
        (tx) => this.applyApproval(tx, user, request, event.id, confirmed, decidedAt),
        APPROVAL_TRANSACTION_OPTIONS,
      );
    } catch (error) {
      // US-48 AC-8: the check failed at the moment of approving — something
      // changed after the page loaded. The transaction has rolled back, so the
      // event, its bookings and reservations are as they were, and the request
      // is left PENDING: the Coordinator re-checks and decides. Nothing is
      // recorded and no one is notified, since nothing was decided. The same
      // holds for a direct API call, and for the database backstop (US-24):
      // another approval taking a venue between the check and the rebook.
      const conflicts: ArrangementSummaryItem[] | null =
        error instanceof ArrangementCheckFailed
          ? error.check.conflicts
          : isExclusionViolation(error)
            ? [
                {
                  kind: 'VENUE_BOOKING',
                  label: 'Venue booking',
                  reason:
                    'A venue booking was confirmed at the new time while this request was being approved.',
                },
              ]
            : null;
      if (!conflicts) throw error;

      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'CHANGE_REQUEST_CHECK_FAILED',
        message: refusedApprovalMessage(conflicts),
        conflicts,
      });
    }

    // US-48 AC-9: after commit, best-effort.
    await this.notifyOrganiser(event, 'approved', null);

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
   * US-48 AC-7 — the approval itself, inside one transaction: lock what may
   * move, re-run the check, and only if it passes update the event, rebook its
   * arrangements, release the originals and record it all. Any failure —
   * the check, or a step after it — rolls the whole thing back.
   */
  private async applyApproval(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    request: Awaited<ReturnType<EventsChangeReviewService['load']>>['request'],
    eventId: string,
    confirmed: Awaited<ReturnType<EventsService['confirmedArrangements']>>,
    decidedAt: Date,
  ) {
    // Row locks, as a US-32 commit takes them, in a fixed order — the
    // event, then each venue, then each equipment item — so the check below
    // and the rebook that follows see a world nothing else is changing.
    await this.lockArrangements(tx, eventId, request);

    // AC-7/AC-8: the check runs again, on the event as it now is.
    const current = await tx.eventRequest.findUniqueOrThrow({ where: { id: eventId } });
    const check = await this.arrangements.check(tx, request, current);
    if (!check.canApprove) {
      throw new ArrangementCheckFailed(check);
    }

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

    // The event as read under its lock above; the claim did not change it.
    const before = current;

    // US-40: the APPROVED bookings, read before a rebook releases them, so
    // their managers can be told what changed.
    const approvedBookings = await tx.venueBooking.findMany({
      where: { eventId, status: BookingStatus.APPROVED },
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
      select: { id: true, start: true, end: true },
    });

    const changes: FieldChange[] = diffEventFields(before, {
      proposedStart: request.proposedStart ?? undefined,
      proposedEnd: request.proposedEnd ?? undefined,
      expectedAttendance: request.proposedAttendance ?? undefined,
    });

    if (changes.length > 0) {
      await tx.eventRequest.update({
        where: { id: eventId },
        data: {
          ...(request.proposedStart ? { proposedStart: request.proposedStart } : {}),
          ...(request.proposedEnd ? { proposedEnd: request.proposedEnd } : {}),
          ...(request.proposedAttendance !== null
            ? { expectedAttendance: request.proposedAttendance }
            : {}),
        },
      });
    }

    // US-48 AC-7: a new date or time rebooks the event's venue bookings and
    // equipment reservations for it and releases the originals, in this
    // same transaction (see the two methods). This replaces US-38's move,
    // which sent bookings back to REQUESTED and released the equipment.
    // An attendance-only change has nothing to rebook.
    const arrangements: ReschedulingResult = {
      venueBookings: [],
      equipmentReservations: [],
    };
    const moved = this.newWindow(request, before);
    if (moved) {
      arrangements.venueBookings = await this.bookings.rebookForEventChange(
        tx,
        eventId,
        moved.from,
        moved.to,
        request.proposedAttendance,
      );
      arrangements.equipmentReservations = await this.reservations.rebookForEventChange(
        eventId,
        moved.to,
        tx,
      );
      // AC-7: what moved goes into the event's change history.
      changes.push(...movedArrangementChanges(arrangements));
    }

    // US-40 AC-1: an approved booking's date, time or attendance changed —
    // tell its venue's manager, once per booking, in this transaction. A
    // rebooked booking is named by its replacement (US-48), which keeps the
    // approval, so the manager is pointed at the booking they now hold.
    const attendanceChanged = changes.some((c) => c.field === 'expectedAttendance');
    if (moved || attendanceChanged) {
      const replacementOf = new Map(
        arrangements.venueBookings.map((r) => [r.bookingId, r.replacementId]),
      );
      for (const booking of approvedBookings) {
        await this.venueActivity.approvedBookingChanged(tx, replacementOf.get(booking.id) ?? booking.id, {
          ...(moved ? { movedFrom: { start: booking.start, end: booking.end } } : {}),
          ...(attendanceChanged && request.proposedAttendance !== null
            ? { attendance: { from: before.expectedAttendance, to: request.proposedAttendance } }
            : {}),
        });
      }
    }

    if (request.equipmentChanged) {
      const existing = inEntryOrder(
        await tx.equipmentRequirement.findMany({
          where: { eventId: eventId },
          orderBy: REQUIREMENTS_ORDER,
        }),
      );
      const notes = new Map(
        existing.filter((row) => row.equipmentId).map((row) => [row.equipmentId, row.notes]),
      );

      await tx.equipmentRequirement.deleteMany({
        where: { eventId: eventId, equipmentId: { not: null } },
      });
      if (request.equipment.length > 0) {
        await tx.equipmentRequirement.createMany({
          data: request.equipment.map((line) => ({
            eventId: eventId,
            equipmentId: line.equipmentId,
            equipmentType: line.equipment.type,
            quantity: line.quantity,
            notes: notes.get(line.equipmentId) ?? null,
          })),
        });
      }

      const after = inEntryOrder(
        await tx.equipmentRequirement.findMany({
          where: { eventId: eventId },
          orderBy: REQUIREMENTS_ORDER,
        }),
      );

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
            eventId,
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
  }

  /**
   * US-48 AC-7 — lock the event row, the venue of each live booking, and each
   * equipment item that may move or is proposed, in that order. The event row
   * first matches a US-32 commit (event, then item), so the two can wait on
   * each other but never deadlock.
   */
  private async lockArrangements(
    tx: Prisma.TransactionClient,
    eventId: string,
    request: { equipment: { equipmentId: string }[] },
  ): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "EventRequest" WHERE "id" = ${eventId} FOR UPDATE`;

    const [bookings, reservations] = await Promise.all([
      tx.venueBooking.findMany({
        where: { eventId, status: { in: LIVE_BOOKING_STATUSES } },
        select: { venueId: true },
      }),
      tx.equipmentReservation.findMany({
        where: { eventId, status: { in: [...RELEASABLE_STATUSES] } },
        select: { equipmentId: true },
      }),
    ]);

    for (const venueId of [...new Set(bookings.map((b) => b.venueId))].sort()) {
      await this.bookings.lockVenue(tx, venueId);
    }
    const items = new Set([
      ...reservations.map((r) => r.equipmentId),
      ...request.equipment.map((line) => line.equipmentId),
    ]);
    for (const equipmentId of [...items].sort()) {
      await this.reservations.lockEquipment(tx, equipmentId);
    }
  }

  /**
   * US-48 AC-9 — tell the Organiser how their request was decided, with the
   * reason when it was rejected. Only for a real decision — a successful
   * approval or the Coordinator's rejection; a refused approval decides
   * nothing and sends nothing. In-app, after commit, best-effort. No one
   * else is notified by this story (Venue Staff, Technical Support and
   * Attendees are #40, #49 and #38).
   */
  private async notifyOrganiser(
    event: { id: string; name: string | null; organiserId: string },
    outcome: 'approved' | 'rejected',
    reason: string | null,
  ): Promise<void> {
    const name = event.name ?? 'your event';
    await this.notifications.notifySafely({
      recipientId: event.organiserId,
      type: NotificationType.CHANGE_REQUEST_DECIDED,
      message:
        outcome === 'approved'
          ? `Your change request for "${name}" was approved; the event has been updated.`
          : `Your change request for "${name}" was rejected. Reason: ${reason}`,
      relatedEventId: event.id,
    });
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
    const { request, event } = await this.load(user, requestId);
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

    const decided = await this.prisma.eventChangeRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: CHANGE_REQUEST_INCLUDE,
    });

    // US-48 AC-9: the Organiser hears the outcome and why.
    await this.notifyOrganiser(event, 'rejected', dto.reason);

    return decided;
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
