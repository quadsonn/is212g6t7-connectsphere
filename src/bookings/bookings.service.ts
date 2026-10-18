import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  BookingDecisionKind,
  BookingStatus,
  NotificationType,
  Prisma,
  VenueStatus,
} from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { ArrangementsRegistry } from '../common/arrangements/arrangements.registry';
import { Action, Resource, Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AttendeeChangeNotifier } from '../notifications/attendee-change-notifier.service';
import { venueChange } from '../notifications/event-schedule-change';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { overlapping, overlapsRange } from './booking-overlap';
import { rescheduleWindow, TimeWindow } from './booking-reschedule';
import {
  VenueBookingImpact,
  VenueBookingLookup,
  VenueBookingSlot,
} from './booking-impact';

/**
 * Statuses that still hold a venue. REJECTED bookings hold nothing — nothing
 * depends on them (US-14) and they block no date (US-17).
 */
const LIVE_STATUSES: BookingStatus[] = [
  BookingStatus.REQUESTED,
  BookingStatus.APPROVED,
];
import {
  BOOKABLE_EVENT_STATUSES,
  BOOKING_INCLUDE,
  BookingConflict,
  BookingConflictReport,
  BookingDecisionResult,
  BookingQueueEntry,
  BookingRequestResult,
  BookingView,
  BookingWarning,
  canDecide,
  classifyConflicts,
  HARD_CONFLICT_CODE,
  URGENT_WINDOW_DAYS,
} from './booking.types';
import {
  ApproveBookingDto,
  RejectBookingDto,
  ReverseBookingDto,
} from './dto/booking-decision.dto';
import {
  BookingQueueQueryDto,
  QueueSortField,
  QueueView,
} from './dto/booking-queue-query.dto';
import { CreateBookingRequestDto } from './dto/create-booking-request.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Shown beside a booking that was moved with its event (US-38). */
const RESCHEDULED_NOTE =
  'The event was rescheduled; this booking moved to the new dates and needs to be approved again.';

/** US-38 — a booking that was moved, and where it was and is now. */
export interface RescheduledBooking {
  bookingId: string;
  venueId: string;
  venueName: string | null;
  previousStatus: BookingStatus;
  from: TimeWindow;
  to: TimeWindow;
}

/**
 * E5 — venue booking requests, approval, conflict detection.
 */
@Injectable()
export class BookingsService implements VenueBookingLookup {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly notifications: NotificationsService,
    // Requirement change 6: tells the Safety check that bookings changed.
    @Optional() private readonly arrangements?: ArrangementsRegistry,
    // Tells registered Attendees when an approval replaces an event's venue.
    @Optional() private readonly attendeeChanges?: AttendeeChangeNotifier,
  ) {}

  private readonly logger = new Logger(BookingsService.name);

  /**
   * US-21 — a Coordinator requests a venue for one of their events.
   *
   * AC-1 is enforced by the DTO. AC-2: the event's requirements are copied
   * onto the request. AC-3: the row is created REQUESTED ("pending"), never
   * APPROVED. AC-4: an overlap with an approved booking blocks submission and
   * names the booking in the way. AC-5: an overlap with another pending
   * request is allowed but reported as a warning.
   *
   * AMBIGUOUS: submitting a request does not move the event to
   * AWAITING_ARRANGEMENTS. The status machine permits it, but no AC asks for
   * it, and doing so would need EventsService.setStatus() from this module.
   */
  async createRequest(
    user: AuthenticatedUser,
    dto: CreateBookingRequestDto,
  ): Promise<BookingRequestResult> {
    this.access.requireScope(user, Resource.BOOKING, Action.CREATE);

    // ASSIGNED scope: only the Coordinator the event is assigned to may book
    // for it. Unassigned and other Coordinators' events read as not found,
    // matching assertEventAccess().
    const event = await this.prisma.eventRequest.findFirst({
      where: { id: dto.eventId, coordinatorId: user.userId },
    });
    if (!event) {
      throw new NotFoundException('event request not found');
    }

    if (!BOOKABLE_EVENT_STATUSES.includes(event.status)) {
      throw new ConflictException(
        `a venue cannot be requested while the event is ${event.status}`,
      );
    }

    // Drafts are invisible to Coordinators (US-13 AC-4), so an unpublished
    // venue is reported exactly as a missing one.
    const venue = await this.prisma.venue.findFirst({
      where: { id: dto.venueId, status: VenueStatus.PUBLISHED },
    });
    if (!venue) {
      throw new NotFoundException('venue not found');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockVenue(tx, venue.id);

      const overlapping = await this.findOverlapping(
        tx,
        venue.id,
        dto.start,
        dto.end,
      );

      // AC-4: a confirmed booking already holds this slot — or (US-16) Venue
      // Staff have blocked it out.
      const confirmed = overlapping.filter(
        (b) => b.status === BookingStatus.APPROVED,
      );
      const blocked = await this.findOverlappingBlocks(tx, venue.id, dto.start, dto.end);
      if (confirmed.length > 0 || blocked.length > 0) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message:
            confirmed.length > 0
              ? 'the requested time overlaps a confirmed booking for this venue'
              : 'the requested time falls in a period blocked out for this venue',
          conflicts: [...confirmed, ...blocked],
        });
      }

      const booking = await tx.venueBooking.create({
        data: {
          eventId: event.id,
          venueId: venue.id,
          requestedById: user.userId,
          start: dto.start,
          end: dto.end,
          expectedAttendance: dto.expectedAttendance,
          // AC-2: attached so Venue Staff need not open the event.
          preferredLayout: event.preferredLayout,
          layoutNotes: event.layoutNotes,
          accessibilityRequirements: event.accessibilityRequirements,
          accessibilityNotes: event.accessibilityNotes,
          equipmentNeeds: event.equipmentNeeds,
          // status omitted — REQUESTED is the schema default (AC-3).
        },
        include: BOOKING_INCLUDE,
      });

      // AC-5: the only overlaps left are pending ones.
      const warnings: BookingWarning[] =
        overlapping.length > 0
          ? [
              {
                code: 'OVERLAPS_PENDING_REQUEST',
                message:
                  'another pending request overlaps this time; Venue Staff will decide between them',
                conflicts: overlapping,
              },
            ]
          : [];

      return { ...booking, warnings };
    });

    // A new pending request means the event is no longer fully approved.
    await this.arrangements?.notifyChanged(dto.eventId);

    return created;
  }

  /**
   * US-21 AC-6 — the Coordinator's own request history, newest first.
   *
   * Keyed on who raised the request rather than who currently coordinates the
   * event: it is a history of what this Coordinator asked for.
   */
  async findMyRequests(user: AuthenticatedUser): Promise<BookingView[]> {
    this.access.requireScope(user, Resource.BOOKING, Action.READ);

    return this.prisma.venueBooking.findMany({
      where: { requestedById: user.userId },
      orderBy: { createdAt: 'desc' },
      include: BOOKING_INCLUDE,
    });
  }

  /**
   * US-22 — the Venue Staff member's queue of booking requests.
   *
   * AC-1: only requests for venues this staff member manages. AC-2: each
   * entry carries the event, venue, times, attendance, requester and
   * organiser (BOOKING_INCLUDE). AC-3/AC-4: sorting and filtering are applied
   * in the query. AC-5: pending requests close to their event are flagged and
   * float to the top. AC-7: approval or rejection changes the status, which
   * is all it takes to move a request from the pending view to the decided one.
   */
  async findQueue(
    user: AuthenticatedUser,
    query: BookingQueueQueryDto = {},
    now: Date = new Date(),
  ): Promise<BookingQueueEntry[]> {
    this.access.requireScope(user, Resource.BOOKING, Action.DECIDE);

    const view = query.view ?? QueueView.PENDING;
    const viewStatuses: BookingStatus[] =
      view === QueueView.PENDING
        ? [BookingStatus.REQUESTED]
        : [BookingStatus.APPROVED, BookingStatus.REJECTED];
    const statuses = query.status
      ? viewStatuses.filter((s) => s === query.status)
      : viewStatuses;

    const where: Prisma.VenueBookingWhereInput = {
      venue: { managedById: user.userId },
      status: { in: statuses },
      ...(query.venueId ? { venueId: query.venueId } : {}),
      // Overlap with [from, to], so a multi-day booking that straddles the
      // range boundary is still included.
      ...(query.to ? { start: { lte: query.to } } : {}),
      ...(query.from ? { end: { gte: query.from } } : {}),
    };

    // Pending defaults to soonest event first — what needs deciding next.
    // Decided defaults to most recently submitted first.
    const sortBy =
      query.sortBy ??
      (view === QueueView.PENDING ? QueueSortField.EVENT_DATE : QueueSortField.SUBMITTED);
    const sortOrder = query.sortOrder ?? (view === QueueView.PENDING ? 'asc' : 'desc');
    const orderBy: Prisma.VenueBookingOrderByWithRelationInput =
      sortBy === QueueSortField.EVENT_DATE ? { start: sortOrder } : { createdAt: sortOrder };

    const bookings = await this.prisma.venueBooking.findMany({
      where,
      orderBy,
      include: BOOKING_INCLUDE,
    });

    const entries = bookings.map((booking) => {
      const msUntilStart = booking.start.getTime() - now.getTime();
      return {
        ...booking,
        urgent:
          booking.status === BookingStatus.REQUESTED &&
          msUntilStart < URGENT_WINDOW_DAYS * DAY_MS,
        daysUntilStart: Math.floor(msUntilStart / DAY_MS),
      };
    });

    // AC-5: urgent first, keeping the chosen order within each group.
    // Array.prototype.sort is stable, so the database order survives.
    return entries.sort((a, b) => Number(b.urgent) - Number(a.urgent));
  }

  /**
   * Which bookings this caller may read, as a Prisma filter. The relationship
   * to the request decides, not just the role (CLAUDE.md §6):
   *  - a Coordinator (ASSIGNED): requests they raised, or on events assigned to them;
   *  - an Organiser (OWN): requests on their own events (US-23 AC-5);
   *  - Venue Staff (ANY): requests for venues they manage (US-22 AC-1). ANY is
   *    the matrix grant; the managed-venue rule is record-level, as for venues.
   */
  private readableBookingsFilter(user: AuthenticatedUser): Prisma.VenueBookingWhereInput {
    const scope = this.access.requireScope(user, Resource.BOOKING, Action.READ);

    switch (scope) {
      case Scope.ASSIGNED:
        return {
          OR: [
            { requestedById: user.userId },
            { event: { coordinatorId: user.userId } },
          ],
        };
      case Scope.OWN:
        return { event: { organiserId: user.userId } };
      default:
        return { venue: { managedById: user.userId } };
    }
  }

  /**
   * One booking request in full, with its requirements and decision history.
   * Anything outside the caller's reach reads as not found, as event access does.
   */
  async findOneForUser(user: AuthenticatedUser, id: string): Promise<BookingView> {
    const booking = await this.prisma.venueBooking.findFirst({
      where: { AND: [{ id }, this.readableBookingsFilter(user)] },
      include: BOOKING_INCLUDE,
    });

    if (!booking) {
      throw new NotFoundException('booking request not found');
    }

    return booking;
  }

  /**
   * Every booking request on one event that the caller may read, oldest first.
   * US-23 AC-5: how the Coordinator and Organiser see decisions on an event.
   */
  async findForEvent(user: AuthenticatedUser, eventId: string): Promise<BookingView[]> {
    return this.prisma.venueBooking.findMany({
      where: { AND: [{ eventId }, this.readableBookingsFilter(user)] },
      orderBy: { createdAt: 'asc' },
      include: BOOKING_INCLUDE,
    });
  }

  /** US-23 AC-3 — approve, with an optional note. */
  approve(
    user: AuthenticatedUser,
    id: string,
    dto: ApproveBookingDto,
  ): Promise<BookingDecisionResult> {
    return this.recordDecision(
      user,
      id,
      BookingDecisionKind.DECISION,
      BookingStatus.APPROVED,
      dto.note?.trim() || null,
    );
  }

  /** US-23 AC-2 — reject; the DTO guarantees a reason. */
  reject(
    user: AuthenticatedUser,
    id: string,
    dto: RejectBookingDto,
  ): Promise<BookingDecisionResult> {
    return this.recordDecision(
      user,
      id,
      BookingDecisionKind.DECISION,
      BookingStatus.REJECTED,
      dto.reason.trim(),
    );
  }

  /** US-23 AC-6 — overturn a decision as a new recorded action. */
  async reverse(
    user: AuthenticatedUser,
    id: string,
    dto: ReverseBookingDto,
  ): Promise<BookingDecisionResult> {
    const booking = await this.findDecidable(user, id);
    const outcome =
      booking.status === BookingStatus.APPROVED ? BookingStatus.REJECTED : BookingStatus.APPROVED;

    return this.recordDecision(user, id, BookingDecisionKind.REVERSAL, outcome, dto.reason.trim());
  }

  /**
   * THE booking status writer for decisions. The status change and the
   * BookingDecision row are written together in one transaction, so a status
   * can never change without a timestamped, attributed record of why (AC-4),
   * and an earlier record is never touched (AC-6).
   *
   * The venue lock serialises this with request creation and other decisions:
   * a double-clicked "Approve" sees the first approval and is refused (AC-7),
   * and two overlapping requests cannot both be approved.
   */
  private async recordDecision(
    user: AuthenticatedUser,
    id: string,
    kind: BookingDecisionKind,
    outcome: BookingStatus,
    reason: string | null,
  ): Promise<BookingDecisionResult> {
    const { venueId } = await this.findDecidable(user, id);
    let warnings: BookingWarning[] = [];

    const decided = await this.withExclusionAsConflict(id, () =>
      this.prisma.$transaction(async (tx) => {
        await this.lockVenue(tx, venueId);

        // Re-read under the lock: the status may have changed since.
        const current = await tx.venueBooking.findUniqueOrThrow({ where: { id } });

        if (!canDecide(kind, current.status, outcome)) {
          throw new ConflictException(
            kind === BookingDecisionKind.DECISION
              ? `this booking request has already been ${current.status.toLowerCase()}`
              : `a ${current.status.toLowerCase()} booking request cannot be reversed to ${outcome.toLowerCase()}`,
          );
        }

        // US-24 AC-5/AC-7: approving commits the slot, so the overlap check runs
        // again here, under the venue lock — never trusting what the page showed
        // when it loaded. Hard conflicts (approved bookings, US-16 blocks) refuse
        // the approval outright: there is no override, and nothing here moves or
        // cancels another booking. Soft conflicts (pending requests) only warn.
        if (outcome === BookingStatus.APPROVED) {
          const report = await this.conflictsFor(tx, venueId, current.start, current.end, id);
          if (report.hasHardConflict) {
            throw this.hardConflict(report);
          }
          warnings = this.softWarnings(report);
        }

        await tx.bookingDecision.create({
          data: { bookingId: id, decidedById: user.userId, kind, outcome, reason },
        });

        return tx.venueBooking.update({
          where: { id },
          data: { status: outcome, decisionReason: reason },
          include: BOOKING_INCLUDE,
        });
      }),
    );

    await this.notifyDecision(decided, kind);
    if (outcome === BookingStatus.APPROVED) {
      await this.notifyAttendeesIfVenueReplaced(decided);
    }
    // Approving the last pending booking (or withdrawing an approval) changes
    // whether the event is due for its safety check.
    await this.arrangements?.notifyChanged(decided.eventId);

    return { ...decided, warnings };
  }

  /**
   * US-24 — the overlap report for one booking request, for the Venue Staff
   * member deciding it. Read-only and stateless: it is recomputed on every
   * call and on every approval attempt, so any future flow that changes a
   * booking's times gets the re-check for free (AC-7).
   *
   * Scoped like every decision: a booking on a venue the caller does not
   * manage reads as not found.
   */
  async findConflicts(user: AuthenticatedUser, id: string): Promise<BookingConflictReport> {
    const booking = await this.findDecidable(user, id);
    return this.conflictsFor(this.prisma, booking.venueId, booking.start, booking.end, booking.id);
  }

  /**
   * US-24 — every live booking and block on the venue overlapping
   * [start, end), classified. One indexed query per table (the
   * [venueId, start, end] indexes), whatever the number of bookings — never a
   * check per booking. `selfId` is excluded from its own report; null checks a
   * proposed slot that has no booking yet.
   *
   * Buffer/turnaround time between bookings is intentionally not applied: the
   * customer clarified it is not needed, superseding the AC that mentions it.
   */
  async conflictsFor(
    db: Prisma.TransactionClient,
    venueId: string,
    start: Date,
    end: Date,
    selfId: string | null,
  ): Promise<BookingConflictReport> {
    const [bookings, blocks] = await Promise.all([
      db.venueBooking.findMany({
        where: {
          venueId,
          ...overlapping(start, end),
          status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] },
          ...(selfId ? { id: { not: selfId } } : {}),
        },
        orderBy: { start: 'asc' },
        select: { id: true, status: true, start: true, end: true, event: { select: { name: true } } },
      }),
      db.venueBlock.findMany({
        where: { venueId, ...overlapsRange(start, end) },
        orderBy: { start: 'asc' },
        select: { id: true, reason: true, start: true, end: true },
      }),
    ]);

    return classifyConflicts(
      selfId,
      bookings.map((b) => ({ ...b, eventName: b.event.name })),
      blocks.map((b) => ({ blockId: b.id, reason: b.reason, start: b.start, end: b.end })),
    );
  }

  /**
   * US-24 AC-5 — the 409 for a hard conflict. `conflicts` keeps the shape the
   * US-21/US-23 screens already read; the classified report is alongside it.
   */
  private hardConflict(report: BookingConflictReport): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: HARD_CONFLICT_CODE,
      message:
        report.hardConflicts.length > 0
          ? 'another confirmed booking already holds part of this time'
          : 'this time falls in a period blocked out for this venue',
      conflicts: [
        ...report.hardConflicts.map((c) => ({ kind: 'BOOKING' as const, status: BookingStatus.APPROVED, ...c })),
        ...report.blocks.map((b) => ({
          kind: 'BLOCK' as const,
          bookingId: null,
          eventName: null,
          status: 'BLOCKED',
          ...b,
        })),
      ],
      report,
    });
  }

  /** US-24 AC-3 — pending overlaps, reported but never blocking. */
  private softWarnings(report: BookingConflictReport): BookingWarning[] {
    if (report.softConflicts.length === 0) return [];
    return [
      {
        code: 'OVERLAPS_PENDING_REQUEST',
        message: 'other pending requests overlap this time; they can no longer be approved as they stand',
        conflicts: report.softConflicts.map((c) => ({
          kind: 'BOOKING' as const,
          status: BookingStatus.REQUESTED,
          ...c,
        })),
      },
    ];
  }

  /**
   * US-24 — the database backstop. If two writers race past the app check, the
   * EXCLUDE constraint (VenueBooking_no_overlapping_approved) refuses the
   * second with SQLSTATE 23P01. Prisma surfaces that as an unknown request
   * error, so it is recognised by its SQLSTATE and turned into the same 409 as
   * the app check, with a fresh report — never a 500.
   */
  private async withExclusionAsConflict<T>(id: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (isExclusionViolation(error)) {
        const booking = await this.prisma.venueBooking.findUniqueOrThrow({ where: { id } });
        throw this.hardConflict(
          await this.conflictsFor(this.prisma, booking.venueId, booking.start, booking.end, id),
        );
      }
      throw error;
    }
  }

  /**
   * A booking this Venue Staff member may decide on: one for a venue they
   * manage. Anything else reads as not found.
   */
  private async findDecidable(user: AuthenticatedUser, id: string) {
    this.access.requireScope(user, Resource.BOOKING, Action.DECIDE);

    const booking = await this.prisma.venueBooking.findFirst({
      where: { id, venue: { managedById: user.userId } },
    });
    if (!booking) {
      throw new NotFoundException('booking request not found');
    }
    return booking;
  }

  /**
   * An approval is a venue CHANGE, rather than a first booking or one more
   * venue of a multi-venue event, when it takes the place of a booking at a
   * different venue that was once approved and has since been rejected (a
   * reversal). The most recently approved such booking is the one replaced, so
   * a chain of replacements (A, then B, then C) names B when C is approved.
   *
   * AMBIGUOUS: the app has no "replace venue" action; this is how a
   * replacement shows up in the data. A second venue approved while the first
   * is still approved replaces nothing, so it notifies no one.
   *
   * After commit and best-effort: it must never fail the approval itself.
   */
  private async notifyAttendeesIfVenueReplaced(approved: BookingView): Promise<void> {
    if (!this.attendeeChanges) return;

    try {
      const earlier = await this.prisma.venueBooking.findMany({
        where: {
          eventId: approved.eventId,
          venueId: { not: approved.venueId },
          status: BookingStatus.REJECTED,
          decisions: { some: { outcome: BookingStatus.APPROVED } },
        },
        select: {
          venue: { select: { name: true } },
          decisions: {
            where: { outcome: BookingStatus.APPROVED },
            select: { createdAt: true },
          },
        },
      });

      const lastApproved = (b: (typeof earlier)[number]) =>
        Math.max(...b.decisions.map((d) => d.createdAt.getTime()));
      const replaced = [...earlier].sort((a, b) => lastApproved(b) - lastApproved(a))[0];
      if (!replaced) return;

      await this.attendeeChanges.notifyRegisteredAttendees(
        { id: approved.eventId, name: approved.event.name },
        [venueChange(replaced.venue.name, approved.venue.name)],
      );
    } catch (error) {
      this.logger.error(
        `failed to check for a replaced venue on event ${approved.eventId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * US-23 AC-5 — tell the Coordinator who asked and the event's Organiser.
   * After commit and best-effort: a failed notification must not undo the
   * decision (see NotificationsService).
   */
  private async notifyDecision(booking: BookingView, kind: BookingDecisionKind): Promise<void> {
    const verb = booking.status === BookingStatus.APPROVED ? 'approved' : 'rejected';
    const prefix = kind === BookingDecisionKind.REVERSAL ? 'Decision reversed: ' : '';
    const reason = booking.decisionReason ? ` Reason: ${booking.decisionReason}` : '';
    // A message starts with a capital: "The booking…", or after the prefix
    // "Decision reversed: the booking…".
    const article = prefix ? 'the' : 'The';
    const message = `${prefix}${article} booking of ${booking.venue.name ?? 'a venue'} for "${booking.event.name ?? 'your event'}" was ${verb}.${reason}`;

    const recipients = new Set(
      [booking.requestedById, booking.event.organiser.id].filter((r): r is string => Boolean(r)),
    );

    await Promise.all(
      [...recipients].map((recipientId) =>
        this.notifications.notifySafely({
          recipientId,
          type: NotificationType.VENUE_BOOKING_DECIDED,
          message,
          relatedEventId: booking.eventId,
        }),
      ),
    );
  }

  /**
   * Live (pending or approved) bookings on a venue that overlap [start, end).
   * Back-to-back slots do not overlap: one ending at 12:00 and the next
   * starting at 12:00 is fine.
   */
  private async findOverlapping(
    tx: Prisma.TransactionClient,
    venueId: string,
    start: Date,
    end: Date,
  ): Promise<BookingConflict[]> {
    const rows = await tx.venueBooking.findMany({
      where: {
        venueId,
        status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] },
        ...overlapsRange(start, end),
      },
      orderBy: { start: 'asc' },
      include: { event: { select: { name: true } } },
    });

    return rows.map((row) => ({
      kind: 'BOOKING' as const,
      bookingId: row.id,
      eventName: row.event.name,
      start: row.start,
      end: row.end,
      status: row.status,
    }));
  }

  /** US-16 — blocked-out periods on a venue that overlap [start, end). */
  async findOverlappingBlocks(
    tx: Prisma.TransactionClient,
    venueId: string,
    start: Date,
    end: Date,
  ): Promise<BookingConflict[]> {
    const blocks = await tx.venueBlock.findMany({
      where: { venueId, ...overlapsRange(start, end) },
      orderBy: { start: 'asc' },
    });

    return blocks.map((block) => ({
      kind: 'BLOCK' as const,
      bookingId: null,
      blockId: block.id,
      eventName: null,
      reason: block.reason,
      start: block.start,
      end: block.end,
      status: 'BLOCKED',
    }));
  }

  /**
   * US-43 — release every booking the event still holds, tentative or approved.
   *
   * Called inside the transaction that sets the event to CANCELLED, so an event
   * can never be cancelled with a venue still held (or the reverse). Every venue
   * of a multi-venue event is released: the scope is the event, not one venue.
   * Availability and conflict checks count only REQUESTED and APPROVED, so a
   * RELEASED slot shows as free with no further change. REJECTED bookings hold
   * nothing and stay as the decision they were; a repeat call finds nothing
   * live and returns 0.
   */
  async releaseForCancelledEvent(
    eventId: string,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const event = await tx.eventRequest.findUnique({
      where: { id: eventId },
      select: { status: true },
    });

    // A guard on the contract, not a user-facing rule: releasing a live
    // event's venues would silently free slots it still needs.
    if (event?.status !== 'CANCELLED') {
      throw new ConflictException(
        'venue bookings can only be released for a cancelled event',
      );
    }

    const result = await tx.venueBooking.updateMany({
      where: { eventId, status: { in: LIVE_STATUSES } },
      data: { status: BookingStatus.RELEASED, releasedAt: new Date() },
    });

    return result.count;
  }

  /**
   * US-38 — an event's dates changed, so move its live bookings with it.
   *
   * Each REQUESTED or APPROVED booking is shifted by the same amount the event
   * moved and put back to REQUESTED: the slot was approved for the old dates,
   * and Venue Staff must decide again for the new ones. That decision re-checks
   * conflicts (recordDecision), so a clash at the new time surfaces there
   * rather than being assumed away here. Rejected bookings hold nothing and are
   * left alone.
   *
   * Runs inside the caller's transaction, so the event's dates and its bookings
   * change together or not at all.
   */
  async rescheduleForEventChange(
    tx: Prisma.TransactionClient,
    eventId: string,
    from: TimeWindow,
    to: TimeWindow,
  ): Promise<RescheduledBooking[]> {
    const live = await tx.venueBooking.findMany({
      where: { eventId, status: { in: LIVE_STATUSES } },
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        venueId: true,
        status: true,
        start: true,
        end: true,
        venue: { select: { name: true } },
      },
    });

    const moved: RescheduledBooking[] = [];

    for (const booking of live) {
      await this.lockVenue(tx, booking.venueId);

      const next = rescheduleWindow(booking, from, to);
      await tx.venueBooking.update({
        where: { id: booking.id },
        data: {
          start: next.start,
          end: next.end,
          status: BookingStatus.REQUESTED,
          decisionReason: RESCHEDULED_NOTE,
        },
      });

      moved.push({
        bookingId: booking.id,
        venueId: booking.venueId,
        venueName: booking.venue.name,
        previousStatus: booking.status,
        from: { start: booking.start, end: booking.end },
        to: next,
      });
    }

    return moved;
  }

  /**
   * Serialises booking writes per venue for the rest of the transaction, so
   * two requests cannot both pass the overlap check and then both insert.
   * See the concurrency note on VenueBooking in schema.prisma — this is the
   * service-level guarantee standing in for an EXCLUDE constraint. Public so
   * blocking out time (US-16) takes the same lock.
   */
  async lockVenue(
    tx: Prisma.TransactionClient,
    venueId: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${venueId}))`;
  }

  /**
   * AMBIGUOUS: "active/upcoming" is read as "has not finished yet, and is
   * still live". REQUESTED and APPROVED both qualify — a pending request is
   * as much at risk from a capacity cut as an approved one. REJECTED bookings
   * are excluded: nothing depends on them.
   */
  async findLiveBookingsForVenue(
    venueId: string,
    now: Date = new Date(),
  ): Promise<VenueBookingImpact[]> {
    const bookings = await this.prisma.venueBooking.findMany({
      where: {
        venueId,
        end: { gte: now },
        status: { in: LIVE_STATUSES },
      },
      orderBy: { start: 'asc' },
    });

    return bookings.map((booking) => ({
      bookingId: booking.id,
      eventId: booking.eventId,
      start: booking.start,
      end: booking.end,
      status: booking.status,
    }));
  }

  /**
   * US-17 — the slots behind a venue's availability calendar.
   *
   * Overlap is the shared half-open rule in booking-overlap.ts. Selects only the three columns the calendar needs, so the
   * identifying fields are never loaded, let alone returned.
   */
  async findBookingSlotsForVenue(
    venueId: string,
    from: Date,
    to: Date,
  ): Promise<VenueBookingSlot[]> {
    return this.prisma.venueBooking.findMany({
      where: {
        venueId,
        ...overlapping(from, to),
        status: { in: LIVE_STATUSES },
      },
      select: { start: true, end: true, status: true },
      orderBy: { start: 'asc' },
    });
  }
}

/** SQLSTATE 23P01 — exclusion_violation. */
function isExclusionViolation(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientUnknownRequestError ||
      error instanceof Prisma.PrismaClientKnownRequestError) &&
    /\b23P01\b/.test(error.message)
  );
}
