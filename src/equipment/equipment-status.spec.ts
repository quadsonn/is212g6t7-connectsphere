import { EquipmentStatus, ReservationStatus } from '@prisma/client';

import {
  affectsReservations,
  EQUIPMENT_STATUS_LABELS,
  statusChangeError,
  upcomingReservationsWhere,
} from './equipment-status';

const { OPERATIONAL, UNDER_MAINTENANCE, OUT_OF_SERVICE } = EquipmentStatus;

/** US-45 — the operational status rules, tagged "US-45 AC-n". */
describe('US-45 equipment status rules', () => {
  it('uses the story\'s names for the stored values', () => {
    expect(EQUIPMENT_STATUS_LABELS).toEqual({
      OPERATIONAL: 'Available',
      UNDER_MAINTENANCE: 'Under Maintenance',
      OUT_OF_SERVICE: 'Damaged',
    });
  });

  describe('US-45 AC-1/AC-3: which changes are allowed', () => {
    it.each([
      [OPERATIONAL, OUT_OF_SERVICE],
      [OPERATIONAL, UNDER_MAINTENANCE],
      [OUT_OF_SERVICE, UNDER_MAINTENANCE],
      [UNDER_MAINTENANCE, OUT_OF_SERVICE],
      [OUT_OF_SERVICE, OPERATIONAL],
      [UNDER_MAINTENANCE, OPERATIONAL],
    ])('allows %s -> %s', (from, to) => {
      expect(statusChangeError(from, to)).toBeNull();
    });

    it.each([OPERATIONAL, UNDER_MAINTENANCE, OUT_OF_SERVICE])(
      'refuses %s -> the same status, naming it',
      (status) => {
        expect(statusChangeError(status, status)).toBe(
          `this item is already ${EQUIPMENT_STATUS_LABELS[status]}`,
        );
      },
    );
  });

  describe('US-45 AC-5: which changes affect reservations', () => {
    it('taking an item out of use affects its reservations', () => {
      expect(affectsReservations(OUT_OF_SERVICE)).toBe(true);
      expect(affectsReservations(UNDER_MAINTENANCE)).toBe(true);
    });

    it('setting it back to Available does not', () => {
      expect(affectsReservations(OPERATIONAL)).toBe(false);
    });

    it('counts live reservations of this item that have not ended', () => {
      const now = new Date('2026-10-12T09:00:00Z');

      expect(upcomingReservationsWhere('eq-1', now)).toEqual({
        equipmentId: 'eq-1',
        status: { in: [ReservationStatus.REQUESTED, ReservationStatus.APPROVED] },
        end: { gt: now },
      });
    });
  });
});
