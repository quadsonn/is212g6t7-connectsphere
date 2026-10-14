import { BookingStatus, ReservationStatus } from '@prisma/client';

import {
  ConfirmationFacts,
  evaluateConfirmationReadiness,
} from './confirmation-readiness.rules';

const booking = (
  venueName: string,
  status: string = BookingStatus.APPROVED,
  needsReview = false,
) => ({ venueName, status, needsReview });

const linked = (equipmentId: string, equipmentType: string, quantity: number) => ({
  equipmentId,
  equipmentType,
  quantity,
  manuallyConfirmedAt: null,
});

const freeText = (equipmentType: string, manuallyConfirmedAt: Date | null = null) => ({
  equipmentId: null,
  equipmentType,
  quantity: 1,
  manuallyConfirmedAt,
});

const reservation = (
  equipmentId: string,
  quantity: number,
  status: ReservationStatus = ReservationStatus.APPROVED,
) => ({ equipmentId, quantity, status });

const facts = (overrides: Partial<ConfirmationFacts> = {}): ConfirmationFacts => ({
  bookings: [booking('Hall A')],
  requirements: [],
  reservations: [],
  ...overrides,
});

const outstanding = (f: ConfirmationFacts) =>
  evaluateConfirmationReadiness(f)
    .items.filter((item) => item.status !== 'OK')
    .map((item) => item.label);

describe('US-42 confirmation readiness rules', () => {
  describe('venue bookings', () => {
    it('US-42 AC-1/AC-2: no venue booked is not ready', () => {
      const result = evaluateConfirmationReadiness(facts({ bookings: [] }));

      expect(result.ready).toBe(false);
      expect(result.items).toContainEqual({
        kind: 'VENUE',
        label: 'No venue booked',
        status: 'MISSING',
      });
    });

    it('US-42 AC-1: only rejected bookings count as no venue booked', () => {
      expect(
        outstanding(facts({ bookings: [booking('Hall A', BookingStatus.REJECTED)] })),
      ).toEqual(['No venue booked']);
    });

    it('US-42 AC-2: a REQUESTED booking is "still pending"', () => {
      const f = facts({ bookings: [booking('Hall A', BookingStatus.REQUESTED)] });

      expect(evaluateConfirmationReadiness(f).ready).toBe(false);
      expect(outstanding(f)).toEqual(['Venue booking at Hall A still pending']);
    });

    it('US-42 AC-1: a HELD booking is not ready', () => {
      const f = facts({ bookings: [booking('Hall A', 'HELD')] });

      expect(evaluateConfirmationReadiness(f).ready).toBe(false);
      expect(outstanding(f)).toEqual(['Venue booking at Hall A on hold']);
    });

    it('US-42 AC-2: an APPROVED booking flagged for review "needs conflict review"', () => {
      const f = facts({ bookings: [booking('Room 2', BookingStatus.APPROVED, true)] });

      expect(evaluateConfirmationReadiness(f).ready).toBe(false);
      expect(outstanding(f)).toEqual(['Venue booking at Room 2 needs conflict review']);
    });

    it('US-42 AC-1: two venues with one pending is not ready, naming only the pending one', () => {
      const f = facts({
        bookings: [booking('Hall A'), booking('Room 2', BookingStatus.REQUESTED)],
      });

      expect(evaluateConfirmationReadiness(f).ready).toBe(false);
      expect(outstanding(f)).toEqual(['Venue booking at Room 2 still pending']);
    });

    it('US-42 AC-1: every live booking APPROVED is ready; rejected ones are ignored', () => {
      const result = evaluateConfirmationReadiness(
        facts({
          bookings: [
            booking('Hall A'),
            booking('Room 2'),
            booking('Annex', BookingStatus.REJECTED),
          ],
        }),
      );

      expect(result.ready).toBe(true);
      expect(result.items).toEqual([
        { kind: 'VENUE', label: 'Venue booking at Hall A approved', status: 'OK' },
        { kind: 'VENUE', label: 'Venue booking at Room 2 approved', status: 'OK' },
      ]);
    });
  });

  describe('equipment', () => {
    it('US-42 AC-2: a linked line under-reserved reads "not reserved (1 of 2)"', () => {
      const f = facts({
        requirements: [linked('eq-1', 'Projector', 2)],
        reservations: [reservation('eq-1', 1)],
      });

      expect(evaluateConfirmationReadiness(f).ready).toBe(false);
      expect(outstanding(f)).toEqual(['Projector not reserved (1 of 2)']);
    });

    it('US-42: a REQUESTED reservation holds nothing', () => {
      const f = facts({
        requirements: [linked('eq-1', 'Projector', 2)],
        reservations: [reservation('eq-1', 2, ReservationStatus.REQUESTED)],
      });

      expect(evaluateConfirmationReadiness(f).ready).toBe(false);
      expect(outstanding(f)).toEqual(['Projector not reserved (0 of 2)']);
    });

    it('US-42: approved reservations for the same item are summed', () => {
      const result = evaluateConfirmationReadiness(
        facts({
          requirements: [linked('eq-1', 'Projector', 2)],
          reservations: [reservation('eq-1', 1), reservation('eq-1', 1)],
        }),
      );

      expect(result.ready).toBe(true);
      expect(result.items).toContainEqual({
        kind: 'EQUIPMENT',
        label: 'Projector reserved (2 of 2)',
        status: 'OK',
      });
    });

    it('US-42: reservations of a different item do not count', () => {
      expect(
        outstanding(
          facts({
            requirements: [linked('eq-1', 'Projector', 1)],
            reservations: [reservation('eq-2', 5)],
          }),
        ),
      ).toEqual(['Projector not reserved (0 of 1)']);
    });

    it('US-42 AC-2: an unticked free-text line "needs manual check"', () => {
      const result = evaluateConfirmationReadiness(
        facts({ requirements: [freeText('Stage lighting rig')] }),
      );

      expect(result.ready).toBe(false);
      expect(result.items).toContainEqual({
        kind: 'EQUIPMENT',
        label: 'Stage lighting rig - needs manual check',
        status: 'NEEDS_MANUAL_CHECK',
      });
    });

    it('US-42: a ticked free-text line is satisfied', () => {
      const result = evaluateConfirmationReadiness(
        facts({ requirements: [freeText('Stage lighting rig', new Date())] }),
      );

      expect(result.ready).toBe(true);
      expect(result.items).toContainEqual({
        kind: 'EQUIPMENT',
        label: 'Stage lighting rig - manually checked',
        status: 'OK',
      });
    });

    it('US-42 AC-1: no equipment requirements is ready, with no equipment items', () => {
      const result = evaluateConfirmationReadiness(facts());

      expect(result.ready).toBe(true);
      expect(result.items.filter((item) => item.kind === 'EQUIPMENT')).toEqual([]);
    });
  });

  it('US-42 AC-2: lists every outstanding item at once, venues first', () => {
    expect(
      outstanding({
        bookings: [booking('Hall A', BookingStatus.REQUESTED), booking('Room 2', BookingStatus.APPROVED, true)],
        requirements: [linked('eq-1', 'Projector', 2), freeText('Stage lighting rig')],
        reservations: [reservation('eq-1', 1)],
      }),
    ).toEqual([
      'Venue booking at Hall A still pending',
      'Venue booking at Room 2 needs conflict review',
      'Projector not reserved (1 of 2)',
      'Stage lighting rig - needs manual check',
    ]);
  });
});
