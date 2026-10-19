import { Prisma } from '@prisma/client';

/**
 * Serialises booking writes per venue for the rest of the transaction.
 *
 * A plain function so every service that writes a venue's bookings takes the
 * same lock without depending on BookingsService (US-51's BookingReviewService
 * and VenuesService.updateBuffers). BookingsService.lockVenue delegates here.
 */
export async function lockVenue(tx: Prisma.TransactionClient, venueId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${venueId}))`;
}
