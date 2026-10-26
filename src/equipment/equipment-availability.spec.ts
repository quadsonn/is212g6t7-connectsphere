import { EquipmentStatus, ReservationStatus } from '@prisma/client';

import {
  computeItemAvailability,
  holdingReservationsWhere,
  isLendable,
  overlaps,
  peakReservedQuantity,
  ReservationSlot,
} from './equipment-availability';

/** US-29 — the pure availability rules (shared with US-31's commit). */
describe('equipment availability rules (US-29)', () => {
  const at = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00.000Z`);
  const window = { start: at('09:00'), end: at('17:00') };
  const slot = (quantity: number, from: string, to: string): ReservationSlot => ({
    quantity,
    start: at(from),
    end: at(to),
  });

  const mic = {
    id: 'eq-mic',
    type: 'Wireless microphone',
    totalQuantity: 24,
    operationalStatus: EquipmentStatus.OPERATIONAL as EquipmentStatus,
  };

  const check = (
    requestedQuantity: number,
    reservations: ReservationSlot[] = [],
    equipment = mic,
  ) => computeItemAvailability({ equipment, requestedQuantity, reservations, window });

  describe('US-29 AC-1: available units are shown for a given date and time', () => {
    it('is the total when nothing is committed', () => {
      expect(check(1)).toEqual({
        equipmentId: 'eq-mic',
        type: 'Wireless microphone',
        operationalStatus: EquipmentStatus.OPERATIONAL,
        requestedQuantity: 1,
        totalQuantity: 24,
        unavailableQuantity: 0,
        reservedQuantity: 0,
        availableQuantity: 24,
        fullyAvailable: true,
        shortfall: 0,
      });
    });

    it('is the total less units committed in the window', () => {
      expect(check(1, [slot(10, '10:00', '12:00')]).availableQuantity).toBe(14);
    });

    it('never reports a negative number of free units', () => {
      expect(check(1, [slot(30, '10:00', '12:00')]).availableQuantity).toBe(0);
    });
  });

  describe('US-29 AC-2: equipment reserved for an overlapping event is excluded', () => {
    describe('overlaps()', () => {
      it.each([
        ['inside the window', '10:00', '12:00', true],
        ['straddling the start', '08:00', '10:00', true],
        ['straddling the end', '16:00', '18:00', true],
        ['enclosing the window', '07:00', '19:00', true],
        ['entirely before', '06:00', '08:00', false],
        ['entirely after', '18:00', '20:00', false],
        ['ending exactly at the start (back-to-back)', '07:00', '09:00', false],
        ['starting exactly at the end (back-to-back)', '17:00', '19:00', false],
      ])('%s → %s', (_label, from, to, expected) => {
        expect(overlaps({ start: at(from), end: at(to) }, window)).toBe(expected);
      });
    });

    it('counts nothing when there are no reservations', () => {
      expect(peakReservedQuantity([], window)).toBe(0);
    });

    it('counts a single overlapping reservation in full', () => {
      expect(peakReservedQuantity([slot(6, '10:00', '12:00')], window)).toBe(6);
    });

    it('ignores reservations that do not overlap the window', () => {
      expect(
        peakReservedQuantity([slot(6, '06:00', '08:00'), slot(4, '17:00', '20:00')], window),
      ).toBe(0);
    });

    it('adds reservations held at the same moment', () => {
      expect(
        peakReservedQuantity([slot(5, '09:00', '13:00'), slot(3, '12:00', '15:00')], window),
      ).toBe(8);
    });

    it('uses the peak, not the sum, for reservations at different times', () => {
      // Both overlap the window but never at once — only 5 units are ever out.
      expect(
        peakReservedQuantity([slot(5, '09:00', '12:00'), slot(5, '13:00', '17:00')], window),
      ).toBe(5);
    });

    it('treats a hand-over at the same instant as not overlapping', () => {
      expect(
        peakReservedQuantity([slot(5, '09:00', '12:00'), slot(5, '12:00', '17:00')], window),
      ).toBe(5);
    });

    it('only counts the part of a reservation inside the window', () => {
      // 07:00–10:00 (4) and 08:00–09:00 (10) overlap each other, but the
      // second ends exactly as the window opens, so only 4 matter.
      expect(
        peakReservedQuantity([slot(4, '07:00', '10:00'), slot(10, '08:00', '09:00')], window),
      ).toBe(4);
    });

    it('queries only committed (APPROVED) reservations overlapping the window', () => {
      expect(holdingReservationsWhere(['eq-mic'], window)).toEqual({
        equipmentId: { in: ['eq-mic'] },
        status: { in: [ReservationStatus.APPROVED] },
        start: { lt: window.end },
        end: { gt: window.start },
      });
    });

    it.each([
      ReservationStatus.REQUESTED,
      ReservationStatus.REJECTED,
      ReservationStatus.RELEASED,
    ])('does not treat a %s reservation as holding units', (status) => {
      const where = holdingReservationsWhere(['eq-mic'], window);
      expect((where.status as { in: ReservationStatus[] }).in).not.toContain(status);
    });
  });

  describe('US-29 AC-3: damaged or under-maintenance equipment is excluded', () => {
    it.each([
      [EquipmentStatus.OPERATIONAL, true],
      [EquipmentStatus.UNDER_MAINTENANCE, false],
      [EquipmentStatus.OUT_OF_SERVICE, false],
    ])('%s lendable → %s', (status, expected) => {
      expect(isLendable(status)).toBe(expected);
    });

    it.each([EquipmentStatus.UNDER_MAINTENANCE, EquipmentStatus.OUT_OF_SERVICE])(
      'an item %s has no units available',
      (operationalStatus) => {
        expect(check(2, [], { ...mic, operationalStatus })).toMatchObject({
          unavailableQuantity: 24,
          availableQuantity: 0,
          fullyAvailable: false,
          shortfall: 2,
        });
      },
    );
  });

  describe('US-29 AC-4: indicates when the requested quantity is not fully available', () => {
    const committed = [slot(10, '10:00', '12:00')]; // leaves 14 free

    it.each([
      ['below', 13, true, 0],
      ['exactly equal to', 14, true, 0],
      ['one above', 15, false, 1],
      ['well above', 20, false, 6],
    ])(
      'a request %s what is free → fullyAvailable %s, shortfall %s',
      (_label, quantity, fully, shortfall) => {
        expect(check(quantity, committed)).toMatchObject({ fullyAvailable: fully, shortfall });
      },
    );

    it('reports the whole request as the shortfall when nothing is free', () => {
      expect(check(5, [slot(24, '09:00', '17:00')]).shortfall).toBe(5);
    });
  });
});
