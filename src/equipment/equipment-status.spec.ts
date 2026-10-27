import { EquipmentStatus, ReservationStatus } from '@prisma/client';

import {
  computeItemAvailability,
  computeShortages,
  countsOf,
  workingQuantity,
} from './equipment-availability';
import {
  applyStatusMove,
  EQUIPMENT_STATUS_LABELS,
  statusMoveError,
  unitsIn,
  upcomingReservationsWhere,
} from './equipment-status';

const { OPERATIONAL, UNDER_MAINTENANCE, OUT_OF_SERVICE } = EquipmentStatus;

/** 10 projectors: 2 damaged, 1 under maintenance, so 7 working. */
const projector = { type: 'Projector', totalQuantity: 10, damagedQuantity: 2, maintenanceQuantity: 1 };

const at = (hour: number) => new Date(Date.UTC(2030, 9, 1, hour));
const slot = (id: string, quantity: number, from: number, to: number) => ({
  id,
  quantity,
  start: at(from),
  end: at(to),
});

/** US-45 — the quantity-based status rules, tagged "US-45 AC-n". */
describe('US-45 equipment status rules (by quantity)', () => {
  it("uses the story's names for the stored values", () => {
    expect(EQUIPMENT_STATUS_LABELS).toEqual({
      OPERATIONAL: 'Available',
      UNDER_MAINTENANCE: 'Under Maintenance',
      OUT_OF_SERVICE: 'Damaged',
    });
  });

  describe('units in each status', () => {
    it('US-45: working = total - damaged - under maintenance', () => {
      expect(workingQuantity(projector)).toBe(7);
      expect(unitsIn(projector, OPERATIONAL)).toBe(7);
      expect(unitsIn(projector, OUT_OF_SERVICE)).toBe(2);
      expect(unitsIn(projector, UNDER_MAINTENANCE)).toBe(1);
    });
  });

  describe('US-45 AC-1: mark a quantity damaged or under maintenance', () => {
    it('US-45 AC-1: mark 2 of 10 damaged', () => {
      const item = { ...projector, damagedQuantity: 0, maintenanceQuantity: 0 };
      expect(statusMoveError(item, OPERATIONAL, OUT_OF_SERVICE, 2)).toBeNull();
      expect(applyStatusMove(item, OPERATIONAL, OUT_OF_SERVICE, 2)).toEqual({
        damagedQuantity: 2,
        maintenanceQuantity: 0,
      });
    });

    it('US-45 AC-1: under maintenance is a separate count', () => {
      expect(applyStatusMove(projector, OPERATIONAL, UNDER_MAINTENANCE, 3)).toEqual({
        damagedQuantity: 2,
        maintenanceQuantity: 4,
      });
    });

    it('US-45 AC-1: units can move from damaged to under maintenance', () => {
      expect(statusMoveError(projector, OUT_OF_SERVICE, UNDER_MAINTENANCE, 2)).toBeNull();
      expect(applyStatusMove(projector, OUT_OF_SERVICE, UNDER_MAINTENANCE, 2)).toEqual({
        damagedQuantity: 0,
        maintenanceQuantity: 3,
      });
    });

    it('US-45 AC-1: refuses marking more units than are working, with a clear message', () => {
      expect(statusMoveError(projector, OPERATIONAL, OUT_OF_SERVICE, 8)).toBe(
        "Only 7 of 10 Projector are working, so 8 can't be marked damaged.",
      );
    });

    it('US-45 AC-1: marking exactly every working unit is allowed', () => {
      expect(statusMoveError(projector, OPERATIONAL, UNDER_MAINTENANCE, 7)).toBeNull();
    });
  });

  describe('US-45 AC-3: set units back to available', () => {
    it('US-45 AC-3: repairing a quantity restores working units', () => {
      const after = applyStatusMove(projector, OUT_OF_SERVICE, OPERATIONAL, 2);
      expect(after).toEqual({ damagedQuantity: 0, maintenanceQuantity: 1 });
      expect(workingQuantity({ ...projector, ...after })).toBe(9);
    });

    it('US-45 AC-3: refuses repairing more than are damaged, with a clear message', () => {
      expect(statusMoveError(projector, OUT_OF_SERVICE, OPERATIONAL, 3)).toBe(
        "Only 2 Projector are damaged, so 3 can't be set back to available.",
      );
    });

    it('US-45 AC-3: refuses repairing more than are under maintenance, with a clear message', () => {
      expect(statusMoveError(projector, UNDER_MAINTENANCE, OPERATIONAL, 2)).toBe(
        "Only 1 Projector are under maintenance, so 2 can't be set back to available.",
      );
    });

    it.each([OPERATIONAL, UNDER_MAINTENANCE, OUT_OF_SERVICE])(
      'US-45: refuses a move from %s to itself',
      (status) => {
        expect(statusMoveError(projector, status, status, 1)).toBe(
          `the units are already ${EQUIPMENT_STATUS_LABELS[status]}`,
        );
      },
    );
  });

  describe('US-45 AC-4: availability = total - damaged - under maintenance - reserved', () => {
    const window = { start: at(9), end: at(17) };
    const availability = (counts: { damagedQuantity: number; maintenanceQuantity: number }, reserved: number) =>
      computeItemAvailability({
        equipment: {
          id: 'eq-1',
          type: 'Projector',
          totalQuantity: 10,
          operationalStatus: OPERATIONAL,
          ...counts,
        },
        requestedQuantity: 1,
        reservations: reserved ? [{ quantity: reserved, start: at(9), end: at(12) }] : [],
        window,
      });

    it('US-45 AC-4: marking 2 damaged reduces availability by 2, not all 10', () => {
      expect(availability({ damagedQuantity: 0, maintenanceQuantity: 0 }, 0).availableQuantity).toBe(10);
      expect(availability({ damagedQuantity: 2, maintenanceQuantity: 0 }, 0).availableQuantity).toBe(8);
    });

    it('US-45 AC-4: under maintenance reduces it by its own count', () => {
      expect(availability({ damagedQuantity: 0, maintenanceQuantity: 3 }, 0).availableQuantity).toBe(7);
    });

    it('US-45 AC-4: damaged, under maintenance and reserved all come off', () => {
      const a = availability({ damagedQuantity: 2, maintenanceQuantity: 1 }, 4);
      expect(a).toMatchObject({ unavailableQuantity: 3, reservedQuantity: 4, availableQuantity: 3 });
    });

    it('US-45: an item known only by a whole-item status counts all its units out', () => {
      expect(countsOf({ id: 'x', type: 'T', totalQuantity: 6, operationalStatus: OUT_OF_SERVICE })).toEqual({
        totalQuantity: 6,
        damagedQuantity: 6,
        maintenanceQuantity: 0,
      });
      expect(countsOf({ id: 'x', type: 'T', totalQuantity: 6, operationalStatus: UNDER_MAINTENANCE })).toEqual({
        totalQuantity: 6,
        damagedQuantity: 0,
        maintenanceQuantity: 6,
      });
    });
  });

  describe('US-45 AC-5: which reservations are short', () => {
    const now = at(8);

    it('US-45 AC-5: none is short while working units cover them', () => {
      expect(computeShortages(10, [slot('a', 5, 9, 12), slot('b', 5, 10, 13)], now).size).toBe(0);
    });

    it('US-45 AC-5: overlapping reservations over the working units are each short by the excess', () => {
      // 7 working, 5 + 5 overlap 10:00–12:00: 3 too many, and nobody is chosen.
      expect(computeShortages(7, [slot('a', 5, 9, 12), slot('b', 5, 10, 13)], now)).toEqual(
        new Map([
          ['a', 3],
          ['b', 3],
        ]),
      );
    });

    it('US-45 AC-5: a reservation is short by at most its own quantity', () => {
      expect(computeShortages(0, [slot('a', 4, 9, 12)], now)).toEqual(new Map([['a', 4]]));
    });

    it('US-45 AC-5: reservations that never overlap are judged apart', () => {
      expect(computeShortages(5, [slot('a', 5, 9, 12), slot('b', 5, 13, 16)], now).size).toBe(0);
    });

    it('US-45 AC-5: back-to-back reservations do not overlap (half-open)', () => {
      expect(computeShortages(5, [slot('a', 5, 9, 12), slot('b', 5, 12, 16)], now).size).toBe(0);
    });

    it('US-45 AC-5: past reservations are ignored', () => {
      const later = at(14);
      expect(computeShortages(5, [slot('past', 5, 9, 12), slot('next', 5, 15, 17)], later).size).toBe(0);
      expect(computeShortages(2, [slot('past', 5, 9, 12), slot('next', 3, 15, 17)], later)).toEqual(
        new Map([['next', 1]]),
      );
    });

    it('US-45 AC-5: only the remaining part of an ongoing reservation counts', () => {
      // 'a' started before now; 'b' overlaps only its past part.
      expect(computeShortages(5, [slot('a', 5, 9, 15), slot('b', 5, 9, 11)], at(12)).size).toBe(0);
    });

    it('US-45 AC-5: the flag clears once the reservations fit the working units again', () => {
      const reservations = [slot('a', 5, 9, 12), slot('b', 5, 10, 13)];
      expect(computeShortages(7, reservations, now).size).toBe(2);
      // A repair (more working units)…
      expect(computeShortages(10, reservations, now).size).toBe(0);
      // …or a reduction of one reservation.
      expect(computeShortages(7, [slot('a', 2, 9, 12), slot('b', 5, 10, 13)], now).size).toBe(0);
    });

    it('US-45 AC-5: looks only at committed reservations of this item that have not ended, on events still going ahead', () => {
      expect(upcomingReservationsWhere('eq-1', now)).toEqual({
        equipmentId: 'eq-1',
        status: ReservationStatus.APPROVED,
        end: { gt: now },
        event: { status: { notIn: ['COMPLETED', 'CANCELLED', 'REJECTED'] } },
      });
    });
  });
});
