import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, VenueStatus } from '@prisma/client';

import { capacityShortfall } from '../venues/capacity';
import { BookingConflictReport } from './booking.types';

/**
 * US-41 AC-1/AC-3/AC-4/AC-7 — record the alternatives a rejecting decision
 * suggests, after checking each one.
 *
 * Runs inside BookingsService.recordDecision's transaction, so a venue that
 * fails a check refuses the whole rejection: Venue Staff see why and choose
 * again, rather than the request being rejected with half its suggestions.
 *
 * AC-4: a venue is free when nothing hard overlaps the requested time — no
 * APPROVED booking and no blocked-out period — exactly the rule a booking
 * request and an approval are held to (BookingsService.conflictsFor). Pending
 * requests do not make a venue unavailable, as they do not anywhere else.
 *
 * AC-3: a venue picked manually must be free and big enough. Capacity is a
 * hard block (changed from "only has to be free"): a venue that cannot hold
 * the request's expected attendance can never be suggested, so the
 * Coordinator is never offered a venue they could not then request. It is
 * the shared rule (venues/capacity.ts) that BookingsService.createRequest
 * applies. Accessibility still only decides which venues the system
 * *proposes* (AC-2); it does not stop Venue Staff choosing another venue.
 */
export async function attachSuggestions(
  tx: Prisma.TransactionClient,
  context: {
    decisionId: string;
    booking: { id: string; venueId: string; expectedAttendance: number | null };
  },
  venueIds: readonly string[],
  conflictsAt: (venueId: string) => Promise<BookingConflictReport>,
): Promise<void> {
  const venues = await tx.venue.findMany({
    where: { id: { in: [...venueIds] } },
    select: { id: true, name: true, status: true, capacity: true },
  });
  const byId = new Map(venues.map((venue) => [venue.id, venue]));

  for (const venueId of venueIds) {
    const venue = byId.get(venueId);

    // Drafts are invisible outside their manager (US-13 AC-4), so an
    // unpublished venue is reported exactly as a missing one.
    if (!venue || venue.status !== VenueStatus.PUBLISHED) {
      throw new BadRequestException(`suggested venue not found: ${venueId}`);
    }

    if (venue.id === context.booking.venueId) {
      throw new BadRequestException(
        'the venue this request asked for cannot be suggested as its alternative',
      );
    }

    const shortfall = capacityShortfall(venue, context.booking.expectedAttendance);
    if (shortfall) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'CAPACITY_EXCEEDED',
        message: `${shortfall.message} It cannot be suggested.`,
        venueId: venue.id,
      });
    }

    if ((await conflictsAt(venue.id)).hasHardConflict) {
      throw new ConflictException(
        `${venue.name ?? 'That venue'} is not free for the requested time, so it cannot be suggested`,
      );
    }
  }

  // Readable IDs (BSG-001…) come from the column default.
  await tx.bookingSuggestion.createMany({
    data: venueIds.map((venueId) => ({
      bookingId: context.booking.id,
      decisionId: context.decisionId,
      venueId,
    })),
  });
}
