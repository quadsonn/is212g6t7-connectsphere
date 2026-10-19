import { Injectable } from '@nestjs/common';
import { BookingStatus, NotificationType, Prisma } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BOOKING_INCLUDE } from './booking.types';
import { BookingsService } from './bookings.service';
import { bookingsOccupyingWhere } from './venue-occupancy';
import {
  AFFECTED_BOOKING_STATUSES,
  UnavailablePeriod,
  unavailableMessage,
} from './venue-unavailability';

/** US-52 — a booking marked as needing a replacement venue. */
export interface AffectedBooking {
  bookingId: string;
  eventId: string;
  eventName: string | null;
  coordinatorId: string | null;
  venueName: string | null;
  start: Date;
  end: Date;
}

/** US-52 AC-2/AC-3/AC-4 — an affected booking, with its replacement requests. */
const REPLACEMENT_INCLUDE = {
  ...BOOKING_INCLUDE,
  replacementRequests: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      status: true,
      start: true,
      end: true,
      createdAt: true,
      venue: { select: { id: true, name: true } },
    },
  },
} as const satisfies Prisma.VenueBookingInclude;

export type ReplacementNeeded = Prisma.VenueBookingGetPayload<{
  include: typeof REPLACEMENT_INCLUDE;
}>;

/**
 * US-52 — reacting to a booked venue becoming unavailable, in the way US-33
 * reacts to an event being cancelled: it finds what is affected and says so.
 *
 * Per the customer (Week 7 change 2), the event is NOT cancelled and nothing
 * about it or its other bookings changes. Each affected booking is marked as
 * needing a replacement and the Coordinator is told; everything after that is
 * theirs to do, through the ordinary booking request flow (US-21/US-23).
 */
@Injectable()
export class VenueUnavailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly bookings: BookingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * #57 HOOK — call this when Venue Staff mark a venue unavailable.
   *
   * #57 ("mark venue unavailable") is not built yet, so nothing calls this
   * today; the US-52 tests create the unavailability record directly and then
   * call it. US-16's blocked-out periods do not call it either: blocking time
   * already leaves existing bookings alone and reports them to the staff
   * member, and changing that is not this story's to decide.
   *
   * AC-1/trigger: every live (REQUESTED or APPROVED) booking on the venue
   * overlapping the period is marked as needing a replacement, with the
   * period and the reason; the event's other bookings — at other venues, or
   * outside the period — are untouched (Week 7 change 3). Each responsible
   * Coordinator is notified; an event with no Coordinator is marked but not
   * notified, since there is no one to tell.
   *
   * A booking already marked and not yet replaced is left as it is and not
   * notified again, so repeating the call (or a second overlapping period)
   * does not duplicate the Coordinator's notification.
   *
   * Taken under the venue's lock, like every booking write on it, so a
   * booking cannot be approved into the period half-way through.
   *
   * US-50: a booking is affected when the period overlaps its occupied
   * window — its setup and turnaround time included (venue-occupancy.ts).
   */
  async handleVenueUnavailable(
    venueId: string,
    period: UnavailablePeriod,
    reason: string,
  ): Promise<AffectedBooking[]> {
    const affected = await this.prisma.$transaction(async (tx) => {
      await this.bookings.lockVenue(tx, venueId);
      const buffers = await this.bookings.buffersFor(tx, venueId);

      const bookings = await tx.venueBooking.findMany({
        where: {
          venueId,
          status: { in: [...AFFECTED_BOOKING_STATUSES] },
          replacementNeededAt: null,
          ...bookingsOccupyingWhere(period, buffers),
        },
        orderBy: [{ start: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          start: true,
          end: true,
          venue: { select: { name: true } },
          event: { select: { id: true, name: true, coordinatorId: true } },
        },
      });

      if (bookings.length > 0) {
        await tx.venueBooking.updateMany({
          where: { id: { in: bookings.map((b) => b.id) } },
          data: {
            replacementNeededAt: new Date(),
            unavailableFrom: period.start,
            unavailableUntil: period.end,
            unavailableReason: reason,
          },
        });
      }

      return bookings.map((b) => ({
        bookingId: b.id,
        eventId: b.event.id,
        eventName: b.event.name,
        coordinatorId: b.event.coordinatorId,
        venueName: b.venue.name,
        start: b.start,
        end: b.end,
      }));
    });

    // AC-1: after commit and best-effort — a failed notification must not
    // undo the marking (see NotificationsService).
    await Promise.all(
      affected
        .filter((b): b is AffectedBooking & { coordinatorId: string } => b.coordinatorId !== null)
        .map((b) =>
          this.notifications.notifySafely({
            recipientId: b.coordinatorId,
            type: NotificationType.VENUE_UNAVAILABLE,
            message: unavailableMessage({
              eventName: b.eventName,
              venueName: b.venueName,
              booking: b,
              period,
              reason,
            }),
            relatedEventId: b.eventId,
          }),
        ),
    );

    return affected;
  }

  /**
   * AC-2 — this Coordinator's bookings that need a replacement venue: the
   * dashboard's "Venue unavailable" flag, and what the event page offers to
   * replace. A booking leaves this list once a replacement is confirmed.
   *
   * Only the Coordinator responsible for the event: scoped by coordinatorId,
   * like their own request list (gated on BOOKING/CREATE in the controller,
   * which only Coordinators hold).
   */
  async findNeedingReplacement(user: AuthenticatedUser): Promise<ReplacementNeeded[]> {
    this.access.requireScope(user, Resource.BOOKING, Action.CREATE);

    return this.prisma.venueBooking.findMany({
      where: {
        replacementNeededAt: { not: null },
        replacedByBookingId: null,
        // US-53: a booking the Coordinator released no longer needs replacing.
        status: { not: BookingStatus.RELEASED },
        event: { coordinatorId: user.userId },
      },
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
      include: REPLACEMENT_INCLUDE,
    });
  }
}

