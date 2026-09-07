/**
 * Domain enums (CLAUDE.md §7).
 *
 * These are currently plain TypeScript enums. Once the corresponding models
 * land in `prisma/schema.prisma`, the schema becomes the source of truth —
 * at that point replace these declarations with re-exports of the generated
 * Prisma enums so the two cannot drift apart.
 */

export enum Role {
  EVENT_ORGANISER = 'EVENT_ORGANISER',
  EVENT_COORDINATOR = 'EVENT_COORDINATOR',
  VENUE_STAFF = 'VENUE_STAFF',
  TECHNICAL_SUPPORT_STAFF = 'TECHNICAL_SUPPORT_STAFF',
  ATTENDEE = 'ATTENDEE',
}

export enum EventStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PLANNING = 'PLANNING',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum BookingStatus {
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum RegistrationStatus {
  REGISTERED = 'REGISTERED',
  WITHDRAWN = 'WITHDRAWN',
}
