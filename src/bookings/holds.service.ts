import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingDecisionKind, BookingStatus, Prisma, VenueBooking, VenueStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { isLiveHold } from './booking-overlap';
import { assertTransition, BookingAction } from './booking-status.machine';
import {
  BOOKABLE_EVENT_STATUSES,
  BOOKING_INCLUDE,
  BookingDecisionResult,
  BookingRequestResult,
  BookingView,
} from './booking.types';
import { BookingsService } from './bookings.service';
import { HoldExpiryDto, PlaceHoldDto } from './dto/hold.dto';
import { HOLD_RELEASED_BY_STAFF, releaseExpiredHolds, releaseHold } from './hold-expiry';
import { HoldNotifier } from './hold-notifier';

export const CONVERTED_FROM_HOLD = 'Converted from hold';

/** US-54 — an event Venue Staff may hold a slot for, as the picker shows it. */
export interface HoldableEvent {
  id: string;
  name: string | null;
  proposedStart: Date | null;
  proposedEnd: Date | null;
  expectedAttendance: number | null;
  coordinator: { id: string; name: string } | null;
}

/**
 * US-54 — tentative venue holds, placed and managed by the Venue Staff member
 * who manages the venue (Venue.managedById). Anyone else reads as not found,
 * like every other venue write (findManaged) and booking decision
 * (findDecidable). Wrong roles are refused before this by the permission guard.
 *
 * Every write runs under the venue lock, first releasing the venue's expired
 * holds (releaseExpiredHolds), then re-checking under the lock. Status changes
 * go through booking-status.machine.ts.
 */
@Injectable()
export class HoldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly bookings: BookingsService,
    private readonly notifier: HoldNotifier,
  ) {}

  /**
   * The events a hold may be placed for: any in a bookable status. Venue
   * Staff otherwise only read events already booked with them (US-25); this
   * returns only what the picker needs, nothing about the organiser or the
   * event's content. See docs/adr/0001-held-hard-blocks-at-db-level.md.
   */
  async holdableEvents(user: AuthenticatedUser, venueId: string): Promise<HoldableEvent[]> {
    await this.findManagedVenue(user, venueId);

    return this.prisma.eventRequest.findMany({
      where: { status: { in: [...BOOKABLE_EVENT_STATUSES] } },
      orderBy: [{ proposedStart: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        proposedStart: true,
        proposedEnd: true,
        expectedAttendance: true,
        coordinator: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * AC-1/AC-2/AC-3 — hold a free slot for an event until `expiresAt`.
   *
   * Hard conflicts (an approved booking, another live hold, a block) refuse it
   * with the US-24 409; overlapping pending requests are only warned about,
   * in the US-21 shape. AC-7: the event's Coordinator is told.
   */
  async place(user: AuthenticatedUser, venueId: string, dto: PlaceHoldDto): Promise<BookingRequestResult> {
    const venue = await this.findManagedVenue(user, venueId);
    if (venue.status !== VenueStatus.PUBLISHED) {
      throw new ConflictException('a draft venue cannot be held');
    }

    const event = await this.prisma.eventRequest.findUnique({ where: { id: dto.eventId } });
    if (!event) {
      throw new NotFoundException('event request not found');
    }
    if (!BOOKABLE_EVENT_STATUSES.includes(event.status)) {
      throw new ConflictException(`a venue cannot be held while the event is ${event.status}`);
    }
    assertExpiry(dto.expiresAt, event.proposedStart, dto.start);

    return this.bookings.withExclusionAsConflict({ venueId, start: dto.start, end: dto.end }, () =>
      this.prisma.$transaction(async (tx) => {
        await this.bookings.lockVenue(tx, venueId);
        await releaseExpiredHolds(tx, this.notifier, { venueId });

        const report = await this.bookings.conflictsFor(tx, venueId, dto.start, dto.end, null);
        if (report.hasHardConflict) {
          throw this.bookings.hardConflict(report);
        }

        assertTransition(BookingAction.HOLD, null, BookingStatus.HELD);
        const booking = await tx.venueBooking.create({
          data: {
            eventId: event.id,
            venueId,
            start: dto.start,
            end: dto.end,
            status: BookingStatus.HELD,
            holdExpiresAt: dto.expiresAt,
            heldById: user.userId,
            // As a request does (US-21 AC-2): what the slot is being held for.
            expectedAttendance: event.expectedAttendance,
            preferredLayout: event.preferredLayout,
            layoutNotes: event.layoutNotes,
            accessibilityRequirements: event.accessibilityRequirements,
            accessibilityNotes: event.accessibilityNotes,
            equipmentNeeds: event.equipmentNeeds,
          },
          include: BOOKING_INCLUDE,
        });

        await this.notifier.placed(tx, booking.id);

        return { ...booking, warnings: this.bookings.softWarnings(report) };
      }),
    );
  }

  /**
   * AC-5 — the hold becomes a confirmed booking. The same checks an approval
   * runs (US-24 AC-5/AC-7), under the lock; recorded as a DECISION so the
   * booking's history shows who confirmed it and how.
   */
  async convert(user: AuthenticatedUser, id: string): Promise<BookingDecisionResult> {
    const { venueId } = await this.findManagedHold(user, id);

    return this.bookings.withExclusionAsConflict(id, () =>
      this.prisma.$transaction(async (tx) => {
        const current = await this.lockAndReadLive(tx, venueId, id);

        const report = await this.bookings.conflictsFor(tx, venueId, current.start, current.end, id);
        if (report.hasHardConflict) {
          throw this.bookings.hardConflict(report);
        }

        assertTransition(BookingAction.CONVERT, current.status, BookingStatus.APPROVED);
        await tx.bookingDecision.create({
          data: {
            bookingId: id,
            decidedById: user.userId,
            kind: BookingDecisionKind.DECISION,
            outcome: BookingStatus.APPROVED,
            reason: CONVERTED_FROM_HOLD,
          },
        });
        const updated = await tx.venueBooking.update({
          where: { id },
          data: { status: BookingStatus.APPROVED, decisionReason: CONVERTED_FROM_HOLD },
          include: BOOKING_INCLUDE,
        });
        await this.notifier.converted(tx, id);

        return { ...updated, warnings: this.bookings.softWarnings(report) };
      }),
    );
  }

  /** AC-5 — a new expiry, under the same rules; the 24-hour warning re-arms. */
  async extend(user: AuthenticatedUser, id: string, dto: HoldExpiryDto): Promise<BookingView> {
    const { venueId } = await this.findManagedHold(user, id);

    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockAndReadLive(tx, venueId, id);
      const event = await tx.eventRequest.findUniqueOrThrow({ where: { id: current.eventId } });
      assertExpiry(dto.expiresAt, event.proposedStart, current.start);

      return tx.venueBooking.update({
        where: { id },
        data: { holdExpiresAt: dto.expiresAt, holdWarningSentAt: null },
        include: BOOKING_INCLUDE,
      });
    });
  }

  /** AC-5 — give the slot back now. The Coordinator is told why. */
  async release(user: AuthenticatedUser, id: string): Promise<BookingView> {
    const { venueId } = await this.findManagedHold(user, id);

    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockAndReadLive(tx, venueId, id);
      await releaseHold(tx, this.notifier, current, HOLD_RELEASED_BY_STAFF);
      return tx.venueBooking.findUniqueOrThrow({ where: { id }, include: BOOKING_INCLUDE });
    });
  }

  /**
   * Under the venue lock: release the venue's expired holds, then re-read
   * this one and require it to be a live hold. An expired one is 409, not
   * converted, extended or released by hand — expiry already released it.
   */
  private async lockAndReadLive(
    tx: Prisma.TransactionClient,
    venueId: string,
    id: string,
  ): Promise<VenueBooking> {
    await this.bookings.lockVenue(tx, venueId);
    const now = new Date();
    const before = await tx.venueBooking.findUniqueOrThrow({ where: { id } });
    if (before.status !== BookingStatus.HELD) {
      throw new ConflictException(`this booking is not a hold (it is ${before.status.toLowerCase()})`);
    }
    if (!isLiveHold(before, now)) {
      throw new ConflictException('this hold has expired');
    }
    await releaseExpiredHolds(tx, this.notifier, { venueId }, now);
    return before;
  }

  private async findManagedVenue(user: AuthenticatedUser, venueId: string) {
    this.access.requireScope(user, Resource.BOOKING, Action.DECIDE);
    const venue = await this.prisma.venue.findFirst({ where: { id: venueId, managedById: user.userId } });
    if (!venue) {
      throw new NotFoundException('venue not found');
    }
    return venue;
  }

  private async findManagedHold(user: AuthenticatedUser, id: string) {
    this.access.requireScope(user, Resource.BOOKING, Action.DECIDE);
    const booking = await this.prisma.venueBooking.findFirst({
      where: { id, venue: { managedById: user.userId } },
    });
    if (!booking) {
      throw new NotFoundException('booking not found');
    }
    return booking;
  }
}

/**
 * AC-2 — now < expiresAt < event start. Also before the held slot starts: a
 * hold that outlives the start of what it holds would block a slot already
 * in use. (The DTO has already refused a past expiry; checked again here for
 * callers that skip it.)
 */
function assertExpiry(expiresAt: Date, eventStart: Date | null, slotStart: Date): void {
  if (expiresAt <= new Date()) {
    throw new BadRequestException('expiresAt must be in the future');
  }
  if (eventStart && expiresAt >= eventStart) {
    throw new BadRequestException('expiresAt must be before the event starts');
  }
  if (expiresAt >= slotStart) {
    throw new BadRequestException('expiresAt must be before the held time starts');
  }
}
