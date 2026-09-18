/**
 * Domain enums (CLAUDE.md §5).
 *
 * `prisma/schema.prisma` is the source of truth — these are re-exports of the
 * generated Prisma enums, so the database and the application cannot drift
 * apart. Import from here rather than from '@prisma/client' directly, so the
 * indirection stays available if the enums ever need to diverge.
 *
 * Run `npm run prisma:generate` after editing the schema.
 */

export {
  Role,
  EventStatus,
  BookingStatus,
  RegistrationStatus,
  ReservationStatus,
  NotificationType,
  VenueStatus,
  // US-06. Shared so the venue suitability story compares a requested layout
  // against a supported one using the same values, rather than matching
  // strings across two independent vocabularies.
  RoomLayout,
  AccessibilityFeature,
} from '@prisma/client';
