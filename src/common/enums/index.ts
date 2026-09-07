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
} from '@prisma/client';
