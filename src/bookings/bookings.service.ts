import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessibilityFeature,
  BookingDecisionKind,
  BookingStatus,
  NotificationType,
  Prisma,
  RoomLayout,
  VenueStatus,
} from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource, Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { capacityShortfall } from '../venues/capacity';
import {
  bookingsOccupyingWhere,
  buffersOf,
  clashingBlocksWhere,
  clashingBookingsWhere,
  VenueBuffers,
} from './venue-occupancy';
import { attachSuggestions } from './booking-suggestions';
import { ACTIVE_BOOKING_STATUSES, VenueArrangement, venueArrangement } from './venue-arrangement';
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

/** The requirement fields a request copies from an event or an earlier request. */
export interface RequirementSnapshot {
  preferredLayout: RoomLayout | null;
  layoutNotes: string | null;
  accessibilityRequirements: AccessibilityFeature[];
  accessibilityNotes: string | null;
  equipmentNeeds: string | null;
}

/**
 * US-53 AC-2 — the request's own requirements, where it sets them, over the
 * ones it would otherwise copy. `undefined` keeps the copy; `null` clears it.
 */
function withOwnRequirements(
  copied: RequirementSnapshot,
  own: Partial<RequirementSnapshot>,
): RequirementSnapshot {
  return {
    preferredLayout: own.preferredLayout !== undefined ? own.preferredLayout : copied.preferredLayout,
    layoutNotes: own.layoutNotes !== undefined ? own.layoutNotes : copied.layoutNotes,
    accessibilityRequirements: own.accessibilityRequirements ?? copied.accessibilityRequirements,
    accessibilityNotes:
      own.accessibilityNotes !== undefined ? own.accessibilityNotes : copied.accessibilityNotes,
    equipmentNeeds: own.equipmentNeeds !== undefined ? own.equipmentNeeds : copied.equipmentNeeds,
  };
}

function requirementsOf(source: RequirementSnapshot): RequirementSnapshot {
  return {
    preferredLayout: source.preferredLayout,
    layoutNotes: source.layoutNotes,
    accessibilityRequirements: source.accessibilityRequirements,
    accessibilityNotes: source.accessibilityNotes,
    equipmentNeeds: source.equipmentNeeds,
  };
}

/**
 * Internal options for createRequest, set by callers that build a request
 * from an earlier one (US-41) — never from the request body.
 */
export interface CreateRequestOptions {
  /** Copy requirements from this earlier request instead of the event. */
  requirementsFrom?: RequirementSnapshot;
  /** Runs inside the request's transaction, after it is created. */
  onCreated?: (tx: Prisma.TransactionClient, booking: BookingView) => Promise<void>;
}
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

/**
 * US-48 AC-7 — a booking rebooked for an approved change request: the
 * original (now RELEASED) and its replacement, and where each is.
 */
export interface RebookedBooking {
  /** The original, released once the replacement existed. */
  bookingId: string;
  /** The new booking for the new details. */
  replacementId: string;
  venueId: string;
  venueName: string | null;
  /** Kept: an approved booking stays approved (customer: no re-approval). */
  status: BookingStatus;
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
  ) {}

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
    options: CreateRequestOptions = {},
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

    // Capacity is a hard block, not a warning: a venue too small for the
    // expected attendance cannot be requested. Every request comes through
    // here — the form, an accepted suggestion (US-41 AC-6) and a replacement
    // (US-52) — so none of them can bypass it. The shared rule
    // (venues/capacity.ts), the same one US-48's re-check applies.
    const shortfall = capacityShortfall(venue, dto.expectedAttendance);
    if (shortfall) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'CAPACITY_EXCEEDED',
        message: shortfall.message,
        capacity: shortfall.capacity,
        expectedAttendance: shortfall.attendance,
      });
    }

    // US-52 AC-3: a replacement names the booking it replaces, which must be
    // one of this event's, marked as needing a replacement and not yet
    // replaced. It carries that booking's requirements, not the event's.
    const replaced = dto.replacesBookingId
      ? await this.findReplaceable(event.id, dto.replacesBookingId)
      : null;

    return this.prisma.$transaction(async (tx) => {
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
          // AC-2: attached so Venue Staff need not open the event. US-41/US-52:
          // a request made from an earlier one carries that one's requirements.
          // US-53 AC-2: any set on this request are this venue's own.
          ...withOwnRequirements(requirementsOf(options.requirementsFrom ?? replaced ?? event), dto),
          replacesBookingId: replaced?.id ?? null,
          // status omitted — REQUESTED is the schema default (AC-3).
        },
        include: BOOKING_INCLUDE,
      });

      // US-41: e.g. claiming the accepted suggestion, in this transaction so
      // the request and the claim land together or not at all.
      await options.onCreated?.(tx, booking);

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

  /**
   * US-53 AC-5 — whether this event's venues are arranged: at least one
   * active booking, and every active one approved. Derived from the bookings
   * on each call; nothing is stored.
   *
   * The Coordinator responsible for the event only; anyone else's event reads
   * as not found.
   */
  async arrangementForEvent(user: AuthenticatedUser, eventId: string): Promise<VenueArrangement> {
    this.access.requireScope(user, Resource.BOOKING, Action.CREATE);

    const event = await this.prisma.eventRequest.findFirst({
      where: { id: eventId, coordinatorId: user.userId },
      select: { venueBookings: { select: { status: true } } },
    });
    if (!event) {
      throw new NotFoundException('event request not found');
    }

    return venueArrangement(event.venueBookings);
  }

  /**
   * US-53 AC-6 — the Coordinator cancels a pending request or releases an
   * approved booking: it becomes RELEASED (it holds nothing, and its slot is
   * free again) and its record is kept.
   *
   * Only that one booking changes — never the event's other bookings, and
   * never the event itself (Week 7 change 3). Taken under the venue's lock,
   * like every other booking write on it, so it cannot cross an approval.
   */
  async release(user: AuthenticatedUser, id: string): Promise<BookingView> {
    this.access.requireScope(user, Resource.BOOKING, Action.CREATE);

    // The responsible Coordinator only; anything else reads as not found.
    const booking = await this.prisma.venueBooking.findFirst({
      where: { id, event: { coordinatorId: user.userId } },
      select: { id: true, venueId: true },
    });
    if (!booking) {
      throw new NotFoundException('booking request not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockVenue(tx, booking.venueId);

      const current = await tx.venueBooking.findUniqueOrThrow({ where: { id: booking.id } });
      if (!ACTIVE_BOOKING_STATUSES.includes(current.status)) {
        throw new ConflictException(
          `a ${current.status.toLowerCase()} booking cannot be released`,
        );
      }

      return tx.venueBooking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.RELEASED, releasedAt: new Date() },
        include: BOOKING_INCLUDE,
      });
    });
  }

  /**
   * US-47 AC-5 — the event was rejected as unfulfillable, so release every
   * venue booking it still holds or asks for: pending ones (tentative holds)
   * and approved ones alike, since a rejected event must not keep occupying a
   * venue. Each becomes RELEASED with its record kept.
   *
   * Runs in the caller's transaction, with the rejection itself. Each venue
   * is locked first, in a fixed order, so a concurrent approval either lands
   * first (and is released here) or waits and finds the booking released.
   */
  async releaseForEvent(tx: Prisma.TransactionClient, eventId: string): Promise<number> {
    const live = await tx.venueBooking.findMany({
      where: { eventId, status: { in: LIVE_STATUSES } },
      select: { venueId: true },
    });

    for (const venueId of [...new Set(live.map((b) => b.venueId))].sort()) {
      await this.lockVenue(tx, venueId);
    }

    const released = await tx.venueBooking.updateMany({
      where: { eventId, status: { in: LIVE_STATUSES } },
      data: { status: BookingStatus.RELEASED, releasedAt: new Date() },
    });
    return released.count;
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

  /**
   * US-23 AC-2 — reject; the DTO guarantees a reason.
   * US-41 AC-1 — optionally with alternative venues.
   */
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
      dto.alternativeVenueIds ?? [],
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

    // US-41: alternatives belong to a rejection, not to an approval.
    const alternatives = dto.alternativeVenueIds ?? [];
    if (alternatives.length > 0 && outcome !== BookingStatus.REJECTED) {
      throw new BadRequestException(
        'alternative venues can only be suggested when rejecting a request',
      );
    }

    return this.recordDecision(
      user,
      id,
      BookingDecisionKind.REVERSAL,
      outcome,
      dto.reason.trim(),
      alternatives,
    );
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
    alternativeVenueIds: readonly string[] = [],
  ): Promise<BookingDecisionResult> {
    const { venueId, replacesBookingId } = await this.findDecidable(user, id);
    let warnings: BookingWarning[] = [];

    // US-52 AC-5: approving a replacement also writes the original booking,
    // so its venue is locked too — both in one fixed order, so two such
    // approvals can never wait on each other's locks.
    const replacedVenueId = replacesBookingId
      ? (await this.prisma.venueBooking.findUnique({
          where: { id: replacesBookingId },
          select: { venueId: true },
        }))?.venueId
      : undefined;
    const venuesToLock = [...new Set([venueId, replacedVenueId ?? venueId])].sort();

    const decided = await this.withExclusionAsConflict(id, () =>
      this.prisma.$transaction(async (tx) => {
        for (const lockId of venuesToLock) {
          await this.lockVenue(tx, lockId);
        }

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
          // Capacity is a hard block on approval too, a decision or a
          // reversal alike: a request over its venue's capacity — submitted
          // before the rule, or the venue's capacity cut since — can only be
          // rejected. The same rule as submission and US-48's re-check
          // (venues/capacity.ts), read under the lock.
          const venue = await tx.venue.findUnique({
            where: { id: venueId },
            select: { name: true, capacity: true },
          });
          const shortfall = venue ? capacityShortfall(venue, current.expectedAttendance) : null;
          if (shortfall) {
            throw new ConflictException({
              statusCode: 409,
              error: 'Conflict',
              code: 'CAPACITY_EXCEEDED',
              message: `Cannot approve: ${shortfall.message}`,
              capacity: shortfall.capacity,
              expectedAttendance: shortfall.attendance,
            });
          }

          const report = await this.conflictsFor(tx, venueId, current.start, current.end, id);
          if (report.hasHardConflict) {
            throw this.hardConflict(report);
          }
          warnings = this.softWarnings(report);
        }

        const decision = await tx.bookingDecision.create({
          data: { bookingId: id, decidedById: user.userId, kind, outcome, reason },
        });

        // US-41 AC-1/AC-4/AC-7: recorded with this decision, after checking
        // each venue is free — so a refused suggestion refuses the rejection.
        if (alternativeVenueIds.length > 0) {
          await attachSuggestions(
            tx,
            { decisionId: decision.id, booking: current },
            alternativeVenueIds,
            (venue) => this.conflictsFor(tx, venue, current.start, current.end, null),
          );
        }

        const updated = await tx.venueBooking.update({
          where: { id },
          data: { status: outcome, decisionReason: reason },
          include: BOOKING_INCLUDE,
        });

        // US-52 AC-5: a confirmed replacement releases the booking it replaces
        // — in this transaction, so one never happens without the other.
        if (outcome === BookingStatus.APPROVED && current.replacesBookingId) {
          await this.releaseReplaced(tx, current.replacesBookingId, id);
        }

        return updated;
      }),
    );

    // US-41 AC-5: the suggestions just attached travel with the rejection.
    const suggested =
      alternativeVenueIds.length > 0
        ? (decided.decisions.at(-1)?.suggestions ?? []).map((s) => s.venue.name ?? 'unnamed venue')
        : [];

    await this.notifyDecision(decided, kind, suggested);

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
   * US-24 — every live booking and block on the venue clashing with
   * [start, end), classified. One indexed query per table (the
   * [venueId, start, end] indexes), whatever the number of bookings — never a
   * check per booking. `selfId` is excluded from its own report; null checks a
   * proposed slot that has no booking yet.
   *
   * US-50 (Week 7 change 1): the venue's setup and turnaround time are now
   * applied — a clash is an overlap of occupied windows (venue-occupancy.ts).
   * This replaces the earlier clarification that buffers were not needed.
   */
  async conflictsFor(
    db: Prisma.TransactionClient,
    venueId: string,
    start: Date,
    end: Date,
    selfId: string | null,
  ): Promise<BookingConflictReport> {
    const buffers = await this.buffersFor(db, venueId);
    const [bookings, blocks] = await Promise.all([
      db.venueBooking.findMany({
        where: {
          venueId,
          ...clashingBookingsWhere({ start, end }, buffers),
          status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] },
          ...(selfId ? { id: { not: selfId } } : {}),
        },
        orderBy: { start: 'asc' },
        select: { id: true, status: true, start: true, end: true, event: { select: { name: true } } },
      }),
      db.venueBlock.findMany({
        where: { venueId, ...clashingBlocksWhere({ start, end }, buffers) },
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
   * US-52 AC-3 — the booking a replacement request names: one of this event's,
   * marked as needing a replacement, and not already replaced. Another
   * event's booking reads as not found.
   */
  private async findReplaceable(eventId: string, bookingId: string) {
    const original = await this.prisma.venueBooking.findFirst({
      where: { id: bookingId, eventId },
    });
    if (!original) {
      throw new NotFoundException('booking to replace not found');
    }
    if (!original.replacementNeededAt) {
      throw new ConflictException('that booking has not been marked as needing a replacement');
    }
    if (original.replacedByBookingId) {
      throw new ConflictException('a replacement for that booking has already been confirmed');
    }
    return original;
  }

  /**
   * US-52 AC-5 — the replacement was approved, so release the original: it no
   * longer holds its venue (RELEASED), keeps its record, and is linked to the
   * replacement. That link is what clears the "Venue unavailable" flag.
   *
   * Only that one booking changes, never the event's others (Week 7 change 3).
   * If another replacement was already confirmed for it, this one is simply a
   * further approved booking: the first confirmation released the original.
   * An original that Venue Staff already rejected holds nothing to release,
   * so it keeps its status and only gains the link.
   */
  private async releaseReplaced(
    tx: Prisma.TransactionClient,
    originalId: string,
    replacementId: string,
  ): Promise<void> {
    const original = await tx.venueBooking.findUniqueOrThrow({ where: { id: originalId } });
    if (original.replacedByBookingId) {
      return;
    }

    await tx.venueBooking.update({
      where: { id: original.id },
      data: {
        replacedByBookingId: replacementId,
        ...(LIVE_STATUSES.includes(original.status)
          ? { status: BookingStatus.RELEASED, releasedAt: new Date() }
          : {}),
      },
    });
  }

  /**
   * A booking this Venue Staff member may decide on: one for a venue they
   * manage. Anything else reads as not found.
   */
  async findDecidable(user: AuthenticatedUser, id: string) {
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
   * US-23 AC-5 — tell the Coordinator who asked and the event's Organiser.
   * After commit and best-effort: a failed notification must not undo the
   * decision (see NotificationsService).
   */
  private async notifyDecision(
    booking: BookingView,
    kind: BookingDecisionKind,
    suggestedVenues: readonly string[] = [],
  ): Promise<void> {
    const verb = booking.status === BookingStatus.APPROVED ? 'approved' : 'rejected';
    const prefix = kind === BookingDecisionKind.REVERSAL ? 'Decision reversed: ' : '';
    const reason = booking.decisionReason ? ` Reason: ${booking.decisionReason}` : '';
    const alternatives =
      suggestedVenues.length > 0
        ? ` Alternative venues suggested: ${suggestedVenues.join(', ')}.`
        : '';
    const message = `${prefix}the booking of ${booking.venue.name ?? 'a venue'} for "${booking.event.name ?? 'your event'}" was ${verb}.${reason}${alternatives}`;

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
   * Live (pending or approved) bookings on a venue that clash with
   * [start, end), setup and turnaround included (US-50). Back-to-back
   * occupied windows do not clash: one ending at 12:00 and the next starting
   * at 12:00 is fine.
   */
  private async findOverlapping(
    tx: Prisma.TransactionClient,
    venueId: string,
    start: Date,
    end: Date,
  ): Promise<BookingConflict[]> {
    const buffers = await this.buffersFor(tx, venueId);
    const rows = await tx.venueBooking.findMany({
      where: {
        venueId,
        status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] },
        ...clashingBookingsWhere({ start, end }, buffers),
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

  /**
   * US-16 — blocked-out periods on a venue that overlap [start, end), or
   * (US-50) the setup and turnaround time around it.
   */
  async findOverlappingBlocks(
    tx: Prisma.TransactionClient,
    venueId: string,
    start: Date,
    end: Date,
  ): Promise<BookingConflict[]> {
    const buffers = await this.buffersFor(tx, venueId);
    const blocks = await tx.venueBlock.findMany({
      where: { venueId, ...clashingBlocksWhere({ start, end }, buffers) },
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
   * US-48 AC-7 — an approved change request moved the event, so rebook each of
   * its live bookings for the new details, then release the originals.
   *
   * Replaces US-38's move, which shifted each booking in place and sent it back
   * to REQUESTED. Per the customer, the Coordinator's approval is what
   * matters: Venue Staff are informed offline and do not decide again, so a
   * rebooked APPROVED booking stays APPROVED, its decision history carried
   * over. A REQUESTED one stays REQUESTED.
   *
   * Each new booking keeps its venue and requirements, and moves by the same
   * amount as the event (rescheduleWindow), keeping the setup and teardown
   * time it allows. Its expected attendance is the proposed one, if any.
   *
   * Order, inside the caller's transaction (all or nothing with the event):
   *  1. create every replacement, as REQUESTED;
   *  2. release every original — RELEASED, kept, linked to its replacement;
   *  3. restore APPROVED on the replacements of approved originals.
   * The database refuses two overlapping APPROVED bookings at one venue
   * (US-24), and an original and its replacement — or two of the event's own
   * bookings — may overlap, so nothing is approved until the originals are
   * released. Availability was checked before this runs (US-48's check).
   */
  async rebookForEventChange(
    tx: Prisma.TransactionClient,
    eventId: string,
    from: TimeWindow,
    to: TimeWindow,
    proposedAttendance: number | null,
  ): Promise<RebookedBooking[]> {
    const live = await tx.venueBooking.findMany({
      where: { eventId, status: { in: LIVE_STATUSES } },
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
      include: {
        venue: { select: { name: true } },
        decisions: { orderBy: { createdAt: 'asc' } },
      },
    });

    for (const venueId of [...new Set(live.map((b) => b.venueId))].sort()) {
      await this.lockVenue(tx, venueId);
    }

    const rebooked: RebookedBooking[] = [];

    for (const booking of live) {
      const next = rescheduleWindow(booking, from, to);
      const replacement = await tx.venueBooking.create({
        data: {
          eventId,
          venueId: booking.venueId,
          start: next.start,
          end: next.end,
          requestedById: booking.requestedById,
          expectedAttendance: proposedAttendance ?? booking.expectedAttendance,
          decisionReason: booking.decisionReason,
          ...requirementsOf(booking),
          // status omitted — REQUESTED until the originals are released.
        },
      });

      if (booking.decisions.length > 0) {
        await tx.bookingDecision.createMany({
          data: booking.decisions.map((d) => ({
            bookingId: replacement.id,
            decidedById: d.decidedById,
            kind: d.kind,
            outcome: d.outcome,
            reason: d.reason,
            createdAt: d.createdAt,
          })),
        });
      }

      rebooked.push({
        bookingId: booking.id,
        replacementId: replacement.id,
        venueId: booking.venueId,
        venueName: booking.venue.name,
        status: booking.status,
        from: { start: booking.start, end: booking.end },
        to: next,
      });
    }

    const releasedAt = new Date();
    for (const r of rebooked) {
      await tx.venueBooking.update({
        where: { id: r.bookingId },
        data: { status: BookingStatus.RELEASED, releasedAt, replacedByBookingId: r.replacementId },
      });
    }

    for (const r of rebooked.filter((r) => r.status === BookingStatus.APPROVED)) {
      await tx.venueBooking.update({
        where: { id: r.replacementId },
        data: { status: BookingStatus.APPROVED },
      });
    }

    return rebooked;
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
    // US-50 AC-1: a booking whose setup or turnaround reaches into the range
    // occupies part of it, so it is included, with its buffers.
    const buffers = await this.buffersFor(this.prisma, venueId);
    const rows = await this.prisma.venueBooking.findMany({
      where: {
        venueId,
        ...bookingsOccupyingWhere({ start: from, end: to }, buffers),
        status: { in: LIVE_STATUSES },
      },
      select: { start: true, end: true, status: true },
      orderBy: { start: 'asc' },
    });
    return rows.map((row) => ({ ...row, buffers }));
  }

  /**
   * US-50 AC-4 — a venue's setup and turnaround time, zero when not
   * configured (or the venue is not found: its booking checks then behave as
   * they always did). Public so other booking checks (US-16 blocks, US-52)
   * read buffers the same way.
   */
  async buffersFor(db: Prisma.TransactionClient, venueId: string): Promise<VenueBuffers> {
    const venue = await db.venue.findUnique({
      where: { id: venueId },
      select: { setupMinutes: true, turnaroundMinutes: true },
    });
    return buffersOf(venue);
  }
}

/**
 * SQLSTATE 23P01 — exclusion_violation. Exported so a rebook (US-48) reads the
 * US-24 backstop the same way.
 */
export function isExclusionViolation(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientUnknownRequestError ||
      error instanceof Prisma.PrismaClientKnownRequestError) &&
    /\b23P01\b/.test(error.message)
  );
}
