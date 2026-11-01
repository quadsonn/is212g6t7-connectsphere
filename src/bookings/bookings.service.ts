import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
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
import { ArrangementsRegistry } from '../common/arrangements/arrangements.registry';
import { Action, Resource, Scope } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AttendeeChangeNotifier } from '../notifications/attendee-change-notifier.service';
import { venueChange } from '../notifications/event-schedule-change';
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
import { liveBookingsWhere } from './booking-overlap';
import { rescheduleWindow, TimeWindow } from './booking-reschedule';
import { recheckReviewFlags } from './booking-review.service';
import { assertTransition, BookingAction } from './booking-status.machine';
import { HOLD_RELEASED_BY_RESCHEDULE, releaseExpiredHolds, releaseHold } from './hold-expiry';
import { HoldNotifier } from './hold-notifier';
import { VenueActivityNotifier } from './venue-activity-notifier';
import { lockVenue } from './venue-lock';
import {
  carriedTechnicalSnapshot,
  technicalSnapshotData,
  technicalSnapshotOf,
} from './technical-snapshot';
import {
  VenueBookingImpact,
  VenueBookingLookup,
  VenueBookingSlot,
} from './booking-impact';

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
  LIVE_STATUSES,
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
    private readonly venueActivity: VenueActivityNotifier,
    private readonly holdNotifier: HoldNotifier,
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

    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockVenue(tx, venue.id);
      // US-54: expired holds are free; release them before they are counted.
      await releaseExpiredHolds(tx, this.holdNotifier, { venueId: venue.id });

      const overlapping = await this.findOverlapping(
        tx,
        venue.id,
        dto.start,
        dto.end,
      );

      // AC-4: a confirmed booking already holds this slot — or (US-16) Venue
      // Staff have blocked it out, or (US-54 AC-3) a live tentative hold does.
      const confirmed = overlapping.filter(
        (b) => b.status === BookingStatus.APPROVED || b.status === BookingStatus.HELD,
      );
      const blocked = await this.findOverlappingBlocks(tx, venue.id, dto.start, dto.end);
      if (confirmed.length > 0 || blocked.length > 0) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: confirmed.some((b) => b.status === BookingStatus.APPROVED)
            ? 'the requested time overlaps a confirmed booking for this venue'
            : confirmed.length > 0
              ? 'the requested time overlaps a tentative hold on this venue'
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
          // Story 20 AC-2: always the event's, as it stands now. They are the
          // same at every venue, so a request made from an earlier one does
          // not inherit an older copy.
          ...technicalSnapshotData(await technicalSnapshotOf(tx, event)),
          replacesBookingId: replaced?.id ?? null,
          // status omitted — REQUESTED is the schema default (AC-3).
        },
        include: BOOKING_INCLUDE,
      });

      // US-41: e.g. claiming the accepted suggestion, in this transaction so
      // the request and the claim land together or not at all.
      await options.onCreated?.(tx, booking);

      // US-40 AC-1: tell the venue's manager, in this transaction.
      await this.venueActivity.requestSubmitted(tx, booking.id);

      // AC-5: the only overlaps left are pending ones (REQUESTED stays soft).
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
        : // US-44: released bookings (event cancelled, hold released or
          // expired) stay in the history, shown as Released.
          [BookingStatus.APPROVED, BookingStatus.REJECTED, BookingStatus.RELEASED];
    const statuses = query.status
      ? viewStatuses.filter((s) => s === query.status)
      : viewStatuses;

    const where: Prisma.VenueBookingWhereInput = {
      venue: { managedById: user.userId },
      status: { in: statuses },
      ...(query.venueId ? { venueId: query.venueId } : {}),
      // US-51: only bookings flagged "Conflict - needs review".
      ...(query.needsReview ? { needsReview: true } : {}),
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
        // US-54: an expired hold still sits in the EXCLUDE constraint until
        // released; release it first so it cannot refuse this approval.
        await releaseExpiredHolds(tx, this.holdNotifier, { venueId });

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

        // US-51: a rejected booking holds nothing, so its own "Conflict -
        // needs review" flag no longer applies — cleared automatically.
        const clearsOwnFlag = outcome === BookingStatus.REJECTED && current.needsReview;

        const updated = await tx.venueBooking.update({
          where: { id },
          data: {
            status: outcome,
            decisionReason: reason,
            ...(clearsOwnFlag
              ? { needsReview: false, reviewResolvedAt: new Date(), reviewResolvedById: null }
              : {}),
          },
          include: BOOKING_INCLUDE,
        });

        // US-52 AC-5: a confirmed replacement releases the booking it replaces
        // — in this transaction, so one never happens without the other. US-51:
        // that frees the replaced booking's venue, so its flags are re-checked.
        if (outcome === BookingStatus.APPROVED && current.replacesBookingId) {
          const replacedVenue = await this.releaseReplaced(tx, current.replacesBookingId, id);
          if (replacedVenue) {
            await recheckReviewFlags(replacedVenue, tx);
          }
        }

        // US-51: leaving a live status may end other bookings' buffer
        // clashes too. Same transaction, under the venue lock.
        if (outcome === BookingStatus.REJECTED) {
          await recheckReviewFlags(venueId, tx);
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
   * US-24 — every live booking and block on the venue clashing with
   * [start, end), classified. One indexed query per table (the
   * [venueId, start, end] indexes), whatever the number of bookings — never a
   * check per booking. `selfId` is excluded from its own report; null checks a
   * proposed slot that has no booking yet.
   *
   * US-50 (Week 7 change 1): the venue's setup and turnaround time (US-49's
   * fields) are applied — a clash is an overlap of occupied windows
   * (venue-occupancy.ts). This replaces the earlier clarification that
   * buffers were not needed.
   */
  async conflictsFor(
    db: Prisma.TransactionClient,
    venueId: string,
    start: Date,
    end: Date,
    selfId: string | null,
    now: Date = new Date(),
  ): Promise<BookingConflictReport> {
    const buffers = await this.buffersFor(db, venueId);
    const [bookings, blocks] = await Promise.all([
      db.venueBooking.findMany({
        where: {
          venueId,
          ...clashingBookingsWhere({ start, end }, buffers),
          // US-54: an expired hold is free, released or not.
          ...liveBookingsWhere(now),
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
  hardConflict(report: BookingConflictReport): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: HARD_CONFLICT_CODE,
      message: report.hardConflicts.some((c) => c.status === BookingStatus.APPROVED)
        ? 'another confirmed booking already holds part of this time'
        : report.hardConflicts.length > 0
          ? 'a tentative hold already holds part of this time'
          : 'this time falls in a period blocked out for this venue',
      conflicts: [
        ...report.hardConflicts.map((c) => ({ kind: 'BOOKING' as const, ...c })),
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
  softWarnings(report: BookingConflictReport): BookingWarning[] {
    if (report.softConflicts.length === 0) return [];
    return [
      {
        code: 'OVERLAPS_PENDING_REQUEST',
        message: 'other pending requests overlap this time; they can no longer be approved as they stand',
        conflicts: report.softConflicts.map((c) => ({ kind: 'BOOKING' as const, ...c })),
      },
    ];
  }

  /**
   * US-24 — the database backstop. If two writers race past the app check, the
   * EXCLUDE constraint (VenueBooking_no_overlapping_committed, US-54) refuses the
   * second with SQLSTATE 23P01. Prisma surfaces that as an unknown request
   * error, so it is recognised by its SQLSTATE and turned into the same 409 as
   * the app check, with a fresh report — never a 500.
   */
  async withExclusionAsConflict<T>(
    target: string | { venueId: string; start: Date; end: Date },
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (isExclusionViolation(error)) {
        // US-54: a hold being placed has no row yet; report on its slot.
        const slot =
          typeof target === 'string'
            ? await this.prisma.venueBooking.findUniqueOrThrow({ where: { id: target } })
            : { ...target, id: null };
        throw this.hardConflict(
          await this.conflictsFor(this.prisma, slot.venueId, slot.start, slot.end, slot.id),
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
  ): Promise<string | null> {
    const original = await tx.venueBooking.findUniqueOrThrow({ where: { id: originalId } });
    if (original.replacedByBookingId) {
      return null;
    }

    const releases = LIVE_STATUSES.includes(original.status);
    if (releases) {
      assertTransition(BookingAction.REPLACE, original.status, BookingStatus.RELEASED);
    }
    await tx.venueBooking.update({
      where: { id: original.id },
      data: {
        replacedByBookingId: replacementId,
        ...(releases
          ? { status: BookingStatus.RELEASED, releasedAt: new Date(), releaseReason: REPLACED_REASON }
          : {}),
      },
    });

    // The venue the original no longer holds, for the caller's US-51 re-check.
    return releases ? original.venueId : null;
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
   * An approval is a venue CHANGE, rather than a first booking or one more
   * venue of a multi-venue event, in two cases:
   *  - US-52: it is a replacement request (`replacesBookingId`). Approving it
   *    has just released the original, so the original's venue is the old one.
   *  - Otherwise, it takes the place of a booking at a different venue that was
   *    once approved and has since been rejected (a reversal). The most
   *    recently approved such booking is the one replaced, so a chain of
   *    replacements (A, then B, then C) names B when C is approved.
   *
   * A second venue approved while the first is still approved replaces
   * nothing, so it notifies no one.
   *
   * After commit and best-effort: it must never fail the approval itself.
   */
  private async notifyAttendeesIfVenueReplaced(approved: BookingView): Promise<void> {
    if (!this.attendeeChanges) return;

    try {
      if (approved.replacesBookingId) {
        const original = await this.prisma.venueBooking.findUnique({
          where: { id: approved.replacesBookingId },
          select: { venueId: true, venue: { select: { name: true } } },
        });
        if (original && original.venueId !== approved.venueId) {
          await this.attendeeChanges.notifyRegisteredAttendees(
            { id: approved.eventId, name: approved.event.name },
            [venueChange(original.venue.name, approved.venue.name)],
          );
        }
        return;
      }

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
    // A message starts with a capital: "The booking…", or after the prefix
    // "Decision reversed: the booking…".
    const article = prefix ? 'the' : 'The';
    const message = `${prefix}${article} booking of ${booking.venue.name ?? 'a venue'} for "${booking.event.name ?? 'your event'}" was ${verb}.${reason}${alternatives}`;

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
        ...liveBookingsWhere(),
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
   * US-43 — how many of the event's bookings a cancellation will release
   * (pending, approved or held), for the Organiser's summary. Counted before
   * EventsService.setStatus(CANCELLED), which releases them (US-44,
   * releaseForCancelledEvent below) and returns no count.
   */
  countReleasableForEvent(eventId: string, tx: Prisma.TransactionClient): Promise<number> {
    return tx.venueBooking.count({
      where: { eventId, status: { in: [...RELEASABLE_ON_CANCEL] } },
    });
  }

  /**
   * US-48 AC-7 — an approved change request moved the event, so rebook each of
   * its live bookings for the new details, then release the originals.
   *
   * Replaces US-38's move, which shifted each booking in place and sent it back
   * to REQUESTED. Per the customer, the Coordinator's approval is what
   * matters: Venue Staff are informed (US-40, by the caller) and do not decide
   * again, so a rebooked APPROVED booking stays APPROVED, its decision history
   * carried over. A REQUESTED one stays REQUESTED.
   *
   * Each new booking keeps its venue and requirements, and moves by the same
   * amount as the event (rescheduleWindow), keeping the setup and teardown
   * time it allows. Its expected attendance is the proposed one, if any.
   *
   * US-54: live holds are not rebooked — they were placed for the old slot.
   * They are released first, and the Coordinator told; Venue Staff can hold
   * the new dates if they still want to. Expired ones are left to expiry.
   *
   * Order, inside the caller's transaction (all or nothing with the event):
   *  1. create every replacement, as REQUESTED;
   *  2. release every original — RELEASED, kept, linked to its replacement;
   *  3. restore APPROVED on the replacements of approved originals.
   * The database refuses two overlapping APPROVED bookings at one venue
   * (US-24), and an original and its replacement — or two of the event's own
   * bookings — may overlap, so nothing is approved until the originals are
   * released. Availability was checked before this runs (US-48's check).
   * Every status change goes through the booking transitions
   * (booking-status.machine.ts): REQUEST, REBOOK and CARRY_APPROVAL.
   */
  async rebookForEventChange(
    tx: Prisma.TransactionClient,
    eventId: string,
    from: TimeWindow,
    to: TimeWindow,
    proposedAttendance: number | null,
  ): Promise<RebookedBooking[]> {
    const now = new Date();

    // US-54: release the event's live holds rather than move them.
    const holds = await tx.venueBooking.findMany({
      where: { eventId, status: BookingStatus.HELD, holdExpiresAt: { gt: now } },
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
    });

    const live = await tx.venueBooking.findMany({
      where: { eventId, status: { in: LIVE_STATUSES } },
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
      include: {
        venue: { select: { name: true } },
        decisions: { orderBy: { createdAt: 'asc' } },
      },
    });

    // One fixed order for every venue touched, so two rebooks cannot deadlock.
    const venueIds = [...new Set([...holds, ...live].map((b) => b.venueId))].sort();
    for (const venueId of venueIds) {
      await this.lockVenue(tx, venueId);
    }

    for (const hold of holds) {
      await releaseHold(tx, this.holdNotifier, hold, HOLD_RELEASED_BY_RESCHEDULE, now);
    }

    const rebooked: RebookedBooking[] = [];

    for (const booking of live) {
      const next = rescheduleWindow(booking, from, to);
      assertTransition(BookingAction.REQUEST, null, BookingStatus.REQUESTED);
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
          ...carriedTechnicalSnapshot(booking),
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

    for (const r of rebooked) {
      assertTransition(BookingAction.REBOOK, r.status, BookingStatus.RELEASED);
      await tx.venueBooking.update({
        where: { id: r.bookingId },
        data: {
          status: BookingStatus.RELEASED,
          releasedAt: now,
          releaseReason: REBOOKED_REASON,
          replacedByBookingId: r.replacementId,
        },
      });
    }

    for (const r of rebooked.filter((r) => r.status === BookingStatus.APPROVED)) {
      assertTransition(BookingAction.CARRY_APPROVAL, BookingStatus.REQUESTED, BookingStatus.APPROVED);
      await tx.venueBooking.update({
        where: { id: r.replacementId },
        data: { status: BookingStatus.APPROVED },
      });
    }

    // US-51: the released originals and holds no longer clash with anything,
    // so flags raised against them may clear.
    for (const venueId of venueIds) {
      await recheckReviewFlags(venueId, tx);
    }

    return rebooked;
  }

  /**
   * US-44 — the event was cancelled, so every booking it still has on a venue
   * is released: pending, held (live or expired) or confirmed, including ones
   * flagged "Conflict - needs review" (AC-1). Each becomes RELEASED with the
   * reason and a timestamp (AC-3) and stays on record (AC-4), its history gets
   * a RELEASE entry (by `actorId`, or the system), and its venue's manager is
   * told (AC-5). REJECTED and already RELEASED bookings are left alone, as is
   * every other event's booking (AC-6).
   *
   * Runs inside the cancelling transaction (EventsService.setStatus), so the
   * event is CANCELLED exactly when its bookings are released. Venues are
   * locked in id order, so two cancellations sharing venues cannot deadlock.
   * The slot is free at once (AC-2): every availability query reads only
   * live statuses (liveBookingsWhere), and the EXCLUDE constraint covers only
   * APPROVED and HELD.
   *
   * Returns the ids it released.
   */
  async releaseForCancelledEvent(
    eventId: string,
    tx: Prisma.TransactionClient,
    actorId: string | null = null,
    now: Date = new Date(),
  ): Promise<string[]> {
    const candidates = await tx.venueBooking.findMany({
      where: { eventId, status: { in: [...RELEASABLE_ON_CANCEL] } },
      select: { venueId: true },
    });
    const venueIds = [...new Set(candidates.map((b) => b.venueId))].sort();
    for (const venueId of venueIds) {
      await this.lockVenue(tx, venueId);
    }

    // Re-read under the locks: a decision may have landed in between.
    const bookings = await tx.venueBooking.findMany({
      where: { eventId, status: { in: [...RELEASABLE_ON_CANCEL] } },
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
      select: { id: true, status: true },
    });

    for (const booking of bookings) {
      assertTransition(BookingAction.CANCEL_EVENT, booking.status, BookingStatus.RELEASED);
      await tx.venueBooking.update({
        where: { id: booking.id },
        data: { status: BookingStatus.RELEASED, releaseReason: EVENT_CANCELLED_REASON, releasedAt: now },
      });
      await tx.bookingDecision.create({
        data: {
          bookingId: booking.id,
          decidedById: actorId,
          kind: BookingDecisionKind.RELEASE,
          outcome: BookingStatus.RELEASED,
          reason: EVENT_CANCELLED_REASON,
        },
      });
      await this.venueActivity.bookingReleasedForCancellation(tx, booking.id);
    }

    // US-51: a released booking holds nothing, so its own flag and any it
    // caused on its neighbours are cleared.
    for (const venueId of venueIds) {
      await recheckReviewFlags(venueId, tx, now);
    }

    return bookings.map((b) => b.id);
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
    await lockVenue(tx, venueId);
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
        ...liveBookingsWhere(now),
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
        ...liveBookingsWhere(),
      },
      select: { start: true, end: true, status: true },
      orderBy: { start: 'asc' },
    });
    return rows.map((row) => ({ ...row, buffers }));
  }

  /**
   * US-17 AC-1 — the venue's blocked-off periods (US-16) reaching into
   * [from, to). Times only: the reason and who set the block stay with Venue
   * Staff, so they are not even selected.
   */
  async findBlockWindowsForVenue(venueId: string, from: Date, to: Date): Promise<TimeWindow[]> {
    return this.prisma.venueBlock.findMany({
      where: { venueId, start: { lt: to }, end: { gt: from } },
      select: { start: true, end: true },
      orderBy: { start: 'asc' },
    });
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
 * US-44 AC-1 — what a cancellation releases: pending, approved and held
 * bookings (a hold even if expired but not yet swept). REJECTED and RELEASED
 * hold nothing and are left as they are.
 */
const RELEASABLE_ON_CANCEL: readonly BookingStatus[] = [
  BookingStatus.REQUESTED,
  BookingStatus.APPROVED,
  BookingStatus.HELD,
];

/** US-48 AC-7 — why a booking was released when its event's change was approved. */
export const REBOOKED_REASON = "Rebooked for the event's new details";

/** US-52 AC-5 — why a booking was released once its replacement was approved. */
export const REPLACED_REASON = 'Replaced: the venue became unavailable';

/** US-44 AC-3 — why a booking was released when its event was cancelled. */
export const EVENT_CANCELLED_REASON = 'Event cancelled';

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
