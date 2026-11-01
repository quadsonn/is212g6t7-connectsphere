import { BookingStatus, EquipmentStatus, Prisma, ReservationStatus } from '@prisma/client';

import { BookingsService } from '../bookings/bookings.service';
import { ChangeArrangementCheckService } from './change-arrangement-check.service';

/**
 * US-48 — the arrangement check for the two cases the integration fixtures do
 * not build: an event with no dates, and an item whose reservations are all
 * still requested. Everything else is proven against the test database by
 * test/events-change-request-check.e2e-spec.ts.
 */
describe('US-48 ChangeArrangementCheckService edge cases', () => {
  const at = (day: string) => new Date(`2030-10-${day}T01:00:00Z`);
  const request = {
    proposedStart: at('02'),
    proposedEnd: new Date('2030-10-02T05:00:00Z'),
    proposedAttendance: null,
    equipmentChanged: false,
    equipment: [],
  };

  const build = (db: Record<string, unknown>) => {
    const bookings = { conflictsFor: jest.fn() };
    const service = new ChangeArrangementCheckService(bookings as unknown as BookingsService);
    return { service, bookings, db: db as unknown as Prisma.TransactionClient };
  };

  // TC-S3-113 · US-48 AC-1 · setup: none (unit) · fails if checking a change for an event with no dates crashes or claims something moves
  // Code: ChangeArrangementCheckService.windows (no event dates)
  it('moves nothing and checks nothing at a new time for an event with no dates', async () => {
    const booking = {
      id: 'BKG-1',
      status: BookingStatus.APPROVED,
      start: at('01'),
      end: at('01'),
      venueId: 'VEN-1',
      venue: { id: 'VEN-1', name: 'Hall', capacity: 100 },
    };
    const { service, bookings, db } = build({ venueBooking: { findMany: jest.fn().mockResolvedValue([booking]) } });

    const check = await service.check(db, request, { id: 'EVT-1', proposedStart: null, proposedEnd: null });

    expect(check.newWindow).toBeNull();
    expect(check.venueBookings).toEqual([expect.objectContaining({ bookingId: 'BKG-1', moves: false, available: true })]);
    expect(check.equipmentReservations).toEqual([]);
    expect(bookings.conflictsFor).not.toHaveBeenCalled();
  });

  // TC-S3-118 · US-48 AC-6 · setup: none (unit) · fails if an item whose reservations are all still requested is shown as committed
  // Code: ChangeArrangementCheckService.checkReservations (status REQUESTED unless one is APPROVED)
  it('shows a reservation that is still requested as requested, not committed', async () => {
    const equipment = { id: 'EQP-1', type: 'Projector', totalQuantity: 6, operationalStatus: EquipmentStatus.OPERATIONAL };
    const reservation = { id: 'RSV-1', quantity: 2, status: ReservationStatus.REQUESTED, start: at('01'), end: at('01'), equipment };
    const findMany = jest.fn().mockResolvedValueOnce([reservation]).mockResolvedValue([]);
    const { service, db } = build({
      venueBooking: { findMany: jest.fn().mockResolvedValue([]) },
      equipmentReservation: { findMany },
    });

    const check = await service.check(db, request, { id: 'EVT-1', proposedStart: at('01'), proposedEnd: new Date('2030-10-01T05:00:00Z') });

    expect(check.equipmentReservations).toEqual([
      expect.objectContaining({ reservationIds: ['RSV-1'], status: ReservationStatus.REQUESTED, available: true }),
    ]);
  });
});
