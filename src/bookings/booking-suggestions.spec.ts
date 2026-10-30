import { ConflictException } from '@nestjs/common';
import { BookingStatus, Prisma, Role, VenueStatus } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { PrismaService } from '../prisma/prisma.service';
import { attachSuggestions } from './booking-suggestions';
import { BookingSuggestionsService } from './booking-suggestions.service';
import { BookingsService } from './bookings.service';

/**
 * US-41 — two paths the integration tests cannot build: a suggested venue with
 * no name that is not free, and two accepts of the same suggestion racing. The
 * rest of US-41 is proven end to end in test/bookings-suggestions.e2e-spec.ts.
 */
describe('US-41 suggestions: edge cases', () => {
  // TC-S3-66 · US-41 AC-4 · setup: none (unit) · fails if an unnamed venue that is not free can be suggested, or the refusal breaks
  // Code: attachSuggestions (venue name fallback in the "not free" refusal)
  it('refuses an unnamed venue that is not free, naming it "That venue"', async () => {
    const tx = {
      venue: {
        findMany: jest.fn().mockResolvedValue([{ id: 'VEN-2', name: null, status: VenueStatus.PUBLISHED, capacity: 500 }]),
      },
      bookingSuggestion: { createMany: jest.fn() },
    };

    await expect(
      attachSuggestions(
        tx as unknown as Prisma.TransactionClient,
        { decisionId: 'BDC-1', booking: { id: 'BKG-1', venueId: 'VEN-1', expectedAttendance: 100 } },
        ['VEN-2'],
        async () => ({ hardConflicts: [], softConflicts: [], blocks: [], hasHardConflict: true }),
      ),
    ).rejects.toThrow(new ConflictException('That venue is not free for the requested time, so it cannot be suggested'));
    expect(tx.bookingSuggestion.createMany).not.toHaveBeenCalled();
  });

  // TC-S3-68 · US-41 AC-6 · setup: none (unit) · fails if two accepts of the same suggestion can both create a request
  // Code: BookingSuggestionsService.accept (the claim inside the request's transaction matches no row)
  it('refuses the second of two accepts racing for the same suggestion', async () => {
    const original = {
      id: 'BKG-1',
      eventId: 'EVT-1',
      status: BookingStatus.REJECTED,
      start: new Date(Date.now() + 864e5),
      end: new Date(Date.now() + 2 * 864e5),
      expectedAttendance: 100,
      replacementNeededAt: null,
      replacedByBookingId: null,
    };
    const prisma = {
      bookingSuggestion: {
        findFirst: jest.fn().mockResolvedValue({ id: 'BSG-1', venueId: 'VEN-2', acceptedBookingId: null, booking: original }),
      },
    };
    // Another accept claimed it between the read above and this transaction.
    const tx = { bookingSuggestion: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const bookings = {
      createRequest: jest.fn(async (_user, _dto, options) => options.onCreated(tx, { id: 'BKG-2' })),
    };
    const service = new BookingSuggestionsService(
      prisma as unknown as PrismaService,
      { requireScope: jest.fn() } as unknown as AccessControlService,
      bookings as unknown as BookingsService,
    );

    await expect(
      service.accept({ userId: 'USR-004', role: Role.EVENT_COORDINATOR } as AuthenticatedUser, 'BKG-1', 'BSG-1'),
    ).rejects.toThrow(new ConflictException('this suggestion has already been accepted'));
  });
});
