import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus, VenueStatus } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import {
  ManualAlternative,
  manualAlternatives,
  rankAlternatives,
  RankedAlternative,
} from './booking-alternatives';
import { BookingRequestResult } from './booking.types';
import { BookingsService } from './bookings.service';
import { freeVenueIds } from './venue-occupancy';
import { needsReplacement } from './venue-unavailability';

/** US-41 AC-2 — the candidates for one request, best match first. */
export interface AlternativesReport {
  bookingId: string;
  start: Date;
  end: Date;
  expectedAttendance: number | null;
  candidates: RankedAlternative[];
  /**
   * AC-3 — the other venues that may be chosen by hand: free and big enough,
   * but not meeting every requirement. Nothing outside these two lists is
   * offered; the server refuses an unfit venue sent anyway.
   */
  others: ManualAlternative[];
}

/**
 * US-41 — Venue Staff suggest alternative venues when a request cannot be
 * fulfilled, and the Coordinator accepts one.
 *
 * Attaching suggestions is part of the rejection itself, so it lives in
 * BookingsService.recordDecision (see booking-suggestions.ts). This service
 * holds the two actions around it: proposing candidates (AC-2) and accepting
 * one (AC-6).
 */
@Injectable()
export class BookingSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly bookings: BookingsService,
  ) {}

  /**
   * AC-2 — published venues, other than the one requested, that are free for
   * the requested time and meet its capacity and accessibility requirements,
   * ranked by how well they match.
   *
   * Free is the same rule as everywhere else: no APPROVED booking and no
   * blocked-out period clashing with the slot — US-50: with each venue's own
   * setup and turnaround time, via the shared check (venue-occupancy.ts).
   * Two queries whatever the number of venues.
   *
   * Venue Staff of the request's venue only, like every other decision step.
   */
  async findAlternatives(user: AuthenticatedUser, bookingId: string): Promise<AlternativesReport> {
    const booking = await this.bookings.findDecidable(user, bookingId);

    const venues = await this.prisma.venue.findMany({
      where: { status: VenueStatus.PUBLISHED, id: { not: booking.venueId } },
      select: {
        id: true,
        name: true,
        location: true,
        capacity: true,
        accessibilityFeatures: true,
        supportedLayouts: true,
        setupMinutes: true,
        turnaroundMinutes: true,
      },
    });
    const free = await freeVenueIds(this.prisma, venues, booking, { includeBlocks: true });

    const freeVenues = venues.filter((venue) => free.has(venue.id));
    const candidates = rankAlternatives(freeVenues, booking);

    return {
      bookingId: booking.id,
      start: booking.start,
      end: booking.end,
      expectedAttendance: booking.expectedAttendance,
      candidates,
      others: manualAlternatives(freeVenues, booking, candidates),
    };
  }

  /**
   * AC-6 — the Coordinator accepts a suggestion: a new booking request for
   * that venue, pre-filled with the rejected request's time, attendance and
   * requirements.
   *
   * It goes through BookingsService.createRequest — the same checks as any
   * request (the Coordinator's own event, a bookable status, no confirmed
   * booking or block in the way) — and is REQUESTED, so Venue Staff still
   * decide on it. The suggestion is claimed in the same transaction, so one
   * suggestion can never become two requests.
   */
  async accept(
    user: AuthenticatedUser,
    bookingId: string,
    suggestionId: string,
  ): Promise<BookingRequestResult> {
    this.access.requireScope(user, Resource.BOOKING, Action.CREATE);

    // Scoped to this Coordinator's events: anyone else's reads as not found.
    const suggestion = await this.prisma.bookingSuggestion.findFirst({
      where: {
        id: suggestionId,
        bookingId,
        booking: { event: { coordinatorId: user.userId } },
      },
      include: { booking: true },
    });
    if (!suggestion) {
      throw new NotFoundException('suggestion not found');
    }

    const original = suggestion.booking;

    // AC-5: suggestions are offered on a rejected request. Once a reversal
    // has approved it, there is nothing to replace.
    if (original.status !== BookingStatus.REJECTED) {
      throw new ConflictException('suggestions can only be accepted on a rejected request');
    }
    if (suggestion.acceptedBookingId) {
      throw new ConflictException('this suggestion has already been accepted');
    }
    if (original.start.getTime() <= Date.now()) {
      throw new ConflictException(
        'the requested time has already started; submit a new request instead',
      );
    }
    if (original.expectedAttendance === null) {
      throw new ConflictException(
        'the original request has no expected attendance; submit a new request instead',
      );
    }

    return this.bookings.createRequest(
      user,
      {
        eventId: original.eventId,
        venueId: suggestion.venueId,
        start: original.start,
        end: original.end,
        expectedAttendance: original.expectedAttendance,
        // US-52 AC-4: on a booking whose venue became unavailable, selecting
        // a suggestion is requesting its replacement — approval releases it.
        ...(needsReplacement(original) ? { replacesBookingId: original.id } : {}),
      },
      {
        requirementsFrom: original,
        onCreated: async (tx, created) => {
          const claimed = await tx.bookingSuggestion.updateMany({
            where: { id: suggestion.id, acceptedBookingId: null },
            data: { acceptedBookingId: created.id, acceptedAt: new Date() },
          });
          if (claimed.count === 0) {
            throw new ConflictException('this suggestion has already been accepted');
          }
        },
      },
    );
  }
}
