import { BookingStatus, ReservationStatus } from '@prisma/client';

import { evaluateReadiness, ReadinessFacts } from './safety-readiness.rules';

/** Requirement change 6 AC-1 — when an event is due for its safety check. */
describe('evaluateReadiness', () => {
  const facts = (overrides: Partial<ReadinessFacts> = {}): ReadinessFacts => ({
    bookings: [{ status: BookingStatus.APPROVED }],
    requirements: [],
    reservations: [],
    ...overrides,
  });

  const reserved = (
    equipmentId: string,
    quantity: number,
    status: ReservationStatus = ReservationStatus.APPROVED,
  ) => ({
    equipmentId,
    quantity,
    status,
  });

  it('is ready when every venue booking is approved and nothing else is needed', () => {
    expect(evaluateReadiness(facts())).toEqual({ ready: true, reasons: [] });
  });

  it('is not ready while any venue booking is still pending', () => {
    const result = evaluateReadiness(
      facts({
        bookings: [
          { status: BookingStatus.APPROVED },
          { status: BookingStatus.REQUESTED },
        ],
      }),
    );

    expect(result.ready).toBe(false);
    expect(result.reasons).toEqual(['VENUE_BOOKING_PENDING']);
  });

  it('ignores a rejected booking: it holds nothing', () => {
    expect(
      evaluateReadiness(
        facts({
          bookings: [
            { status: BookingStatus.APPROVED },
            { status: BookingStatus.REJECTED },
          ],
        }),
      ).ready,
    ).toBe(true);
  });

  it('is not ready with no venue booking at all, or only rejected ones', () => {
    expect(evaluateReadiness(facts({ bookings: [] })).reasons).toEqual([
      'NO_APPROVED_VENUE',
    ]);
    expect(
      evaluateReadiness(facts({ bookings: [{ status: BookingStatus.REJECTED }] }))
        .reasons,
    ).toEqual(['NO_APPROVED_VENUE']);
  });

  describe('requested equipment', () => {
    it('is not ready until each requested item is reserved', () => {
      const result = evaluateReadiness(
        facts({ requirements: [{ equipmentId: 'mic', quantity: 2 }] }),
      );

      expect(result.reasons).toEqual(['EQUIPMENT_NOT_RESERVED']);
    });

    it('is ready once approved reservations cover the quantity asked for', () => {
      expect(
        evaluateReadiness(
          facts({
            requirements: [{ equipmentId: 'mic', quantity: 3 }],
            reservations: [reserved('mic', 2), reserved('mic', 1)],
          }),
        ).ready,
      ).toBe(true);
    });

    it('is not ready when the reservation falls short of the quantity', () => {
      expect(
        evaluateReadiness(
          facts({
            requirements: [{ equipmentId: 'mic', quantity: 3 }],
            reservations: [reserved('mic', 2)],
          }),
        ).ready,
      ).toBe(false);
    });

    it('does not count a released or rejected reservation', () => {
      for (const status of [ReservationStatus.RELEASED, ReservationStatus.REJECTED, ReservationStatus.REQUESTED]) {
        expect(
          evaluateReadiness(
            facts({
              requirements: [{ equipmentId: 'mic', quantity: 1 }],
              reservations: [reserved('mic', 1, status)],
            }),
          ).ready,
        ).toBe(false);
      }
    });

    it('counts the right item: a projector does not cover a microphone', () => {
      expect(
        evaluateReadiness(
          facts({
            requirements: [{ equipmentId: 'mic', quantity: 1 }],
            reservations: [reserved('projector', 5)],
          }),
        ).ready,
      ).toBe(false);
    });

    it('cannot check a requirement that names no catalogue item, so it does not block', () => {
      expect(
        evaluateReadiness(
          facts({ requirements: [{ equipmentId: null, quantity: 4 }] }),
        ).ready,
      ).toBe(true);
    });

    it('needs no equipment at all when none is requested', () => {
      expect(evaluateReadiness(facts({ requirements: [] })).ready).toBe(true);
    });
  });

  it('reports every reason at once', () => {
    const result = evaluateReadiness(
      facts({
        bookings: [{ status: BookingStatus.REQUESTED }],
        requirements: [{ equipmentId: 'mic', quantity: 1 }],
      }),
    );

    expect(result.reasons).toEqual(['VENUE_BOOKING_PENDING', 'EQUIPMENT_NOT_RESERVED']);
  });
});
