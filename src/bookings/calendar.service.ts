import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, VenueStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { BookingConflict } from './booking.types';
import { BookingsService } from './bookings.service';
import { CalendarQueryDto, CreateVenueBlockDto } from './dto/calendar.dto';

/** A month view spans at most six weeks; anything wider is refused. */
export const MAX_CALENDAR_DAYS = 42;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * US-16 AC-1 — what occupies a slot. "Available" is the absence of any entry:
 * the calendar draws it for every period not covered by one of these.
 */
export type CalendarEntryKind = 'TENTATIVE' | 'CONFIRMED' | 'BLOCKED';

export interface CalendarEntry {
  /** The booking id, or the block id for kind BLOCKED. */
  id: string;
  kind: CalendarEntryKind;
  venueId: string;
  start: Date;
  end: Date;
  /** AC-4: for a booking — event, organiser, attendance. */
  eventName: string | null;
  organiserName: string | null;
  expectedAttendance: number | null;
  /** AC-6: for a block — why, and who marked it. */
  reason: string | null;
  createdByName: string | null;
}

export interface CalendarView {
  venues: { id: string; name: string | null; location: string | null; capacity: number | null }[];
  entries: CalendarEntry[];
}

export interface VenueBlockResult {
  id: string;
  venueId: string;
  start: Date;
  end: Date;
  reason: string;
  /** Live bookings already in the blocked period, for the staff member to act on. */
  overlappingBookings: BookingConflict[];
}

/**
 * US-16 — the Venue Staff member's availability calendar.
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly bookings: BookingsService,
  ) {}

  /**
   * AC-1/AC-3: the caller's venues (or one of them), and every pending
   * booking, confirmed booking and block on them within [from, to).
   *
   * AC-5: read fresh on every call and never cached, so a refresh — or the
   * client's polling — always reflects the latest confirmations and changes.
   *
   * AMBIGUOUS: only PUBLISHED venues are shown. A draft cannot be booked, so
   * it has no availability to manage yet.
   */
  async getCalendar(user: AuthenticatedUser, query: CalendarQueryDto): Promise<CalendarView> {
    this.access.requireScope(user, Resource.BOOKING, Action.DECIDE);

    if (query.to.getTime() - query.from.getTime() > MAX_CALENDAR_DAYS * DAY_MS) {
      throw new BadRequestException(`the calendar range cannot exceed ${MAX_CALENDAR_DAYS} days`);
    }

    const venues = await this.prisma.venue.findMany({
      where: {
        managedById: user.userId,
        status: VenueStatus.PUBLISHED,
        ...(query.venueId ? { id: query.venueId } : {}),
      },
      select: { id: true, name: true, location: true, capacity: true },
      orderBy: { name: 'asc' },
    });
    const venueIds = venues.map((v) => v.id);
    const inRange = { start: { lt: query.to }, end: { gt: query.from } };

    const [bookings, blocks] = await Promise.all([
      this.prisma.venueBooking.findMany({
        where: {
          venueId: { in: venueIds },
          // Rejected requests hold nothing, so they are not on the calendar.
          status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] },
          ...inRange,
        },
        include: {
          event: { select: { name: true, organiser: { select: { name: true } } } },
        },
        orderBy: { start: 'asc' },
      }),
      this.prisma.venueBlock.findMany({
        where: { venueId: { in: venueIds }, ...inRange },
        include: { createdBy: { select: { name: true } } },
        orderBy: { start: 'asc' },
      }),
    ]);

    const entries: CalendarEntry[] = [
      ...bookings.map((b) => ({
        id: b.id,
        kind: (b.status === BookingStatus.APPROVED ? 'CONFIRMED' : 'TENTATIVE') as CalendarEntryKind,
        venueId: b.venueId,
        start: b.start,
        end: b.end,
        eventName: b.event.name,
        organiserName: b.event.organiser.name,
        expectedAttendance: b.expectedAttendance,
        reason: null,
        createdByName: null,
      })),
      ...blocks.map((block) => ({
        id: block.id,
        kind: 'BLOCKED' as const,
        venueId: block.venueId,
        start: block.start,
        end: block.end,
        eventName: null,
        organiserName: null,
        expectedAttendance: null,
        reason: block.reason,
        createdByName: block.createdBy.name,
      })),
    ].sort((a, b) => a.start.getTime() - b.start.getTime());

    return { venues, entries };
  }

  /**
   * AC-6 — block out a period on a venue the caller manages.
   *
   * Taken under the same per-venue lock as booking requests and approvals, so
   * a booking cannot be approved into a period at the moment it is blocked.
   * Existing bookings in the period are not touched — they are returned so the
   * staff member can decide what to do with them.
   */
  async createBlock(user: AuthenticatedUser, dto: CreateVenueBlockDto): Promise<VenueBlockResult> {
    this.access.requireScope(user, Resource.VENUE, Action.UPDATE);

    const venue = await this.prisma.venue.findFirst({
      where: { id: dto.venueId, managedById: user.userId },
    });
    if (!venue) {
      throw new NotFoundException('venue not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.bookings.lockVenue(tx, venue.id);

      const block = await tx.venueBlock.create({
        data: {
          venueId: venue.id,
          start: dto.start,
          end: dto.end,
          reason: dto.reason.trim(),
          createdById: user.userId,
        },
      });

      const overlapping = await tx.venueBooking.findMany({
        where: {
          venueId: venue.id,
          status: { in: [BookingStatus.REQUESTED, BookingStatus.APPROVED] },
          start: { lt: dto.end },
          end: { gt: dto.start },
        },
        include: { event: { select: { name: true } } },
        orderBy: { start: 'asc' },
      });

      return {
        id: block.id,
        venueId: block.venueId,
        start: block.start,
        end: block.end,
        reason: block.reason,
        overlappingBookings: overlapping.map((b) => ({
          kind: 'BOOKING' as const,
          bookingId: b.id,
          eventName: b.event.name,
          start: b.start,
          end: b.end,
          status: b.status,
        })),
      };
    });
  }

  /** AC-6 — remove a block from one of the caller's venues. */
  async removeBlock(user: AuthenticatedUser, id: string): Promise<void> {
    this.access.requireScope(user, Resource.VENUE, Action.UPDATE);

    const block = await this.prisma.venueBlock.findFirst({
      where: { id, venue: { managedById: user.userId } },
    });
    if (!block) {
      throw new NotFoundException('blocked period not found');
    }

    await this.prisma.venueBlock.delete({ where: { id: block.id } });
  }
}
