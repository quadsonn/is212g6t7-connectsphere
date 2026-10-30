import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma, ReservationStatus } from '@prisma/client';

import { rescheduleWindow, TimeWindow, windowMoved } from '../bookings/booking-reschedule';
import { BookingsService } from '../bookings/bookings.service';
import {
  AVAILABILITY_EQUIPMENT_SELECT,
  computeItemAvailability,
  holdingReservationsWhere,
} from '../equipment/equipment-availability';
import { RELEASABLE_STATUSES } from '../equipment/equipment-reservations.service';
import {
  ArrangementCheck,
  equipmentShortfall,
  EquipmentLineCheck,
  ReservationCheck,
  summarise,
  venueConflicts,
  VenueBookingCheck,
} from './change-arrangement-check';
import { liveBookingsWhere } from '../bookings/booking-overlap';
import { capacityWarnings } from './change-request.rules';

/** The parts of a change request the check reads. */
export interface CheckedRequest {
  proposedStart: Date | null;
  proposedEnd: Date | null;
  proposedAttendance: number | null;
  equipmentChanged: boolean;
  equipment: { equipmentId: string; quantity: number }[];
}

/** The parts of the event the check reads. */
export interface CheckedEvent {
  id: string;
  proposedStart: Date | null;
  proposedEnd: Date | null;
}

/** Live bookings: still asking for or holding a venue. */
const LIVE_BOOKING_STATUSES: BookingStatus[] = [BookingStatus.REQUESTED, BookingStatus.APPROVED];

/**
 * US-48 AC-1..AC-4 — check an event's venue bookings and equipment
 * reservations against a pending change request's proposed details.
 *
 * Read-only: it runs queries and returns a report; nothing is written (AC-1).
 * The same check is run again inside approve()'s transaction, with the rows
 * locked, before anything moves (AC-7/AC-8) — hence the `db` parameter.
 *
 * Reuses, rather than restates:
 *  - venues: BookingsService.conflictsFor, the shared buffer-aware check
 *    (US-50), at each booking's moved window; the event's own bookings are
 *    left out, since they are moving too;
 *  - equipment: US-30's holdingReservationsWhere + computeItemAvailability,
 *    which already treats damaged and under-maintenance items as having
 *    nothing free; this event's own reservations are left out;
 *  - capacity: US-38's capacityWarnings, a warning only.
 *
 * What is checked, by what the request changes:
 *  - a new date or time: every live venue booking and every reservation, at
 *    the new time (they would be rebooked there — AC-6/AC-7);
 *  - a new equipment list: each line, for its quantity at the (new) time;
 *  - a new attendance: capacity, as a warning.
 * An attendance-only change has nothing to move, so only capacity applies.
 */
@Injectable()
export class ChangeArrangementCheckService {
  constructor(private readonly bookings: BookingsService) {}

  async check(
    db: Prisma.TransactionClient,
    request: CheckedRequest,
    event: CheckedEvent,
  ): Promise<ArrangementCheck> {
    const window = this.windows(request, event);

    // The event's live bookings, (US-54) live holds included: a hold can be
    // outgrown too, so it counts for the capacity warning. Holds are not
    // checked at the new time — a move releases them rather than rebooking
    // them (BookingsService.rebookForEventChange).
    const live = await db.venueBooking.findMany({
      where: { eventId: event.id, ...liveBookingsWhere() },
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        start: true,
        end: true,
        venueId: true,
        venue: { select: { id: true, name: true, capacity: true } },
      },
    });

    const bookings = live.filter((b) => LIVE_BOOKING_STATUSES.includes(b.status));
    const venueBookings = await this.checkVenues(db, bookings, window);
    const warnings = capacityWarnings(request.proposedAttendance, live);
    for (const warning of warnings) {
      const booking = venueBookings.find((b) => b.bookingId === warning.bookingId);
      if (booking) booking.capacityWarning = warning.message;
    }

    const equipmentReservations = window.moved
      ? await this.checkReservations(db, event.id, window.to)
      : [];
    const equipment =
      request.equipmentChanged && window.to
        ? await this.checkLines(db, event.id, request.equipment, window.to)
        : [];

    return summarise({
      newWindow: window.moved ? window.to : null,
      venueBookings,
      equipmentReservations,
      equipment,
      warnings,
    });
  }

  /** The event's window now and as proposed; `moved` when they differ. */
  private windows(request: CheckedRequest, event: CheckedEvent) {
    if (!event.proposedStart || !event.proposedEnd) {
      return { from: null, to: null, moved: false } as const;
    }
    const from = { start: event.proposedStart, end: event.proposedEnd };
    const to = {
      start: request.proposedStart ?? event.proposedStart,
      end: request.proposedEnd ?? event.proposedEnd,
    };
    return { from, to, moved: windowMoved(from, to) };
  }

  /** AC-2 — each booking at its moved window, through the shared check. */
  private async checkVenues(
    db: Prisma.TransactionClient,
    bookings: {
      id: string;
      status: BookingStatus;
      start: Date;
      end: Date;
      venueId: string;
      venue: { name: string | null };
    }[],
    window: { from: TimeWindow | null; to: TimeWindow | null; moved: boolean },
  ): Promise<VenueBookingCheck[]> {
    const own = new Set(bookings.map((b) => b.id));

    return Promise.all(
      bookings.map(async (b) => {
        const current = { start: b.start, end: b.end };
        if (!window.moved || !window.from || !window.to) {
          // Staying where it is: nothing to re-check (AC-6: not moved).
          return {
            bookingId: b.id,
            venueId: b.venueId,
            venueName: b.venue.name,
            status: b.status,
            current,
            proposed: current,
            moves: false,
            available: true,
            conflicts: [],
            capacityWarning: null,
          };
        }

        // Each venue on its own (Week 7 change 3), at the booking's own moved
        // window — the setup time it allows kept.
        const proposed = rescheduleWindow(b, window.from, window.to);
        const report = await this.bookings.conflictsFor(
          db,
          b.venueId,
          proposed.start,
          proposed.end,
          b.id,
        );
        const conflicts = venueConflicts(b.venue.name, report, own);

        return {
          bookingId: b.id,
          venueId: b.venueId,
          venueName: b.venue.name,
          status: b.status,
          current,
          proposed,
          moves: true,
          available: conflicts.length === 0,
          conflicts,
          capacityWarning: null,
        };
      }),
    );
  }

  /**
   * AC-6/AC-7 — the reservations approval would rebook, grouped by item: the
   * event's whole quantity of an item must be free at the new time, counting
   * only other events' commitments.
   */
  private async checkReservations(
    db: Prisma.TransactionClient,
    eventId: string,
    to: TimeWindow,
  ): Promise<ReservationCheck[]> {
    const held = await db.equipmentReservation.findMany({
      where: { eventId, status: { in: [...RELEASABLE_STATUSES] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        quantity: true,
        status: true,
        start: true,
        end: true,
        equipment: { select: AVAILABILITY_EQUIPMENT_SELECT },
      },
    });

    const byItem = new Map<string, typeof held>();
    for (const row of held) {
      byItem.set(row.equipment.id, [...(byItem.get(row.equipment.id) ?? []), row]);
    }

    return Promise.all(
      [...byItem.values()].map(async (rows) => {
        const [first] = rows;
        const quantity = rows.reduce((sum, r) => sum + r.quantity, 0);
        const availability = computeItemAvailability({
          equipment: first.equipment,
          requestedQuantity: quantity,
          reservations: await this.othersHolding(db, eventId, first.equipment.id, to),
          window: to,
        });
        const reason = equipmentShortfall(availability);

        return {
          equipmentId: first.equipment.id,
          equipmentType: first.equipment.type,
          reservationIds: rows.map((r) => r.id),
          quantity,
          // Committed if any of them is; all keep their own status on rebook.
          status: rows.some((r) => r.status === ReservationStatus.APPROVED)
            ? ReservationStatus.APPROVED
            : ReservationStatus.REQUESTED,
          current: { start: first.start, end: first.end },
          proposed: to,
          available: reason === null,
          reason,
        };
      }),
    );
  }

  /** AC-3 — each line of the proposed equipment list, at the (new) time. */
  private async checkLines(
    db: Prisma.TransactionClient,
    eventId: string,
    lines: { equipmentId: string; quantity: number }[],
    window: TimeWindow,
  ): Promise<EquipmentLineCheck[]> {
    return Promise.all(
      lines.map(async (line) => {
        const equipment = await db.equipment.findUniqueOrThrow({
          where: { id: line.equipmentId },
          select: AVAILABILITY_EQUIPMENT_SELECT,
        });
        const availability = computeItemAvailability({
          equipment,
          requestedQuantity: line.quantity,
          reservations: await this.othersHolding(db, eventId, equipment.id, window),
          window,
        });
        const reason = equipmentShortfall(availability);

        return {
          equipmentId: equipment.id,
          equipmentType: equipment.type,
          quantity: line.quantity,
          availableQuantity: availability.availableQuantity,
          available: reason === null,
          reason,
        };
      }),
    );
  }

  /** US-30's holding reservations of an item in a window — other events' only. */
  private othersHolding(
    db: Prisma.TransactionClient,
    eventId: string,
    equipmentId: string,
    window: TimeWindow,
  ) {
    return db.equipmentReservation.findMany({
      where: {
        AND: [holdingReservationsWhere([equipmentId], window), { eventId: { not: eventId } }],
      },
      select: { quantity: true, start: true, end: true },
    });
  }
}
