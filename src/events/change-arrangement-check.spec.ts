import { BookingStatus, EquipmentStatus, ReservationStatus } from '@prisma/client';

import { computeItemAvailability } from '../equipment/equipment-availability';
import {
  equipmentShortfall,
  refusedApprovalMessage,
  summarise,
  venueConflicts,
  VenueBookingCheck,
} from './change-arrangement-check';

const window = { start: new Date('2030-10-08T01:00:00Z'), end: new Date('2030-10-08T09:00:00Z') };

const availability = (
  requested: number,
  heldByOthers: number,
  status: EquipmentStatus = EquipmentStatus.OPERATIONAL,
) =>
  computeItemAvailability({
    equipment: { id: 'eq', type: 'Projector', totalQuantity: 6, operationalStatus: status },
    requestedQuantity: requested,
    reservations: heldByOthers > 0 ? [{ quantity: heldByOthers, ...window }] : [],
    window,
  });

const venue = (overrides: Partial<VenueBookingCheck> = {}): VenueBookingCheck => ({
  bookingId: 'b1',
  venueId: 'v1',
  venueName: 'Main Hall',
  status: BookingStatus.APPROVED,
  current: window,
  proposed: window,
  moves: true,
  available: true,
  conflicts: [],
  capacityWarning: null,
  ...overrides,
});

/** US-48 — the rules for reading the arrangement check. Tagged "US-48 AC-n". */
describe('US-48 change request arrangement check rules', () => {
  describe('US-48 AC-2: venue conflicts', () => {
    const report = {
      hardConflicts: [
        { bookingId: 'rival', eventName: 'Gala', status: BookingStatus.APPROVED, ...window },
        { bookingId: 'own-2', eventName: 'Hackathon', status: BookingStatus.APPROVED, ...window },
      ],
      softConflicts: [
        { bookingId: 'pending', eventName: 'Maybe', status: BookingStatus.REQUESTED, ...window },
      ],
      blocks: [{ blockId: 'x', reason: 'Renovation', ...window }],
      hasHardConflict: true,
    };

    it("names each other event's booking and each blocked-out period", () => {
      expect(venueConflicts('Main Hall', report, new Set(['b1', 'own-2']))).toEqual([
        'Main Hall is already booked for "Gala" at the new time (setup and turnaround included).',
        'Main Hall is unavailable at the new time (Renovation).',
      ]);
    });

    it("never counts the event's own bookings, nor pending requests", () => {
      const conflicts = venueConflicts('Main Hall', report, new Set(['b1', 'own-2']));
      expect(conflicts.join(' ')).not.toContain('Hackathon');
      expect(conflicts.join(' ')).not.toContain('Maybe');
    });

    it('US-54 AC-3: says a live tentative hold is a hold, not a booking', () => {
      expect(
        venueConflicts(
          'Main Hall',
          {
            ...report,
            hardConflicts: [
              { bookingId: 'hold', eventName: 'Gala', status: BookingStatus.HELD, ...window },
            ],
            blocks: [],
          },
          new Set(),
        ),
      ).toEqual([
        'Main Hall has a tentative hold for "Gala" at the new time (setup and turnaround included).',
      ]);
    });

    it('reads without a venue or event name', () => {
      expect(
        venueConflicts(
          null,
          {
            ...report,
            hardConflicts: [
              { bookingId: 'r', eventName: null, status: BookingStatus.APPROVED, ...window },
            ],
            blocks: [],
          },
          new Set(),
        ),
      ).toEqual([
        'The booked venue is already booked for "another event" at the new time (setup and turnaround included).',
      ]);
    });

    // TC-S3-114, TC-S3-116 · US-48 AC-2, AC-4 · setup: none (unit) · fails if a nameless hold, a block with no reason, or a nameless venue breaks the check's wording
    // Code: venueConflicts (hold and block fallbacks), summarise (venue name fallback)
    it('reads without a name on a hold, a reason on a block, or a name on the venue', () => {
      expect(
        venueConflicts(
          'Main Hall',
          {
            ...report,
            hardConflicts: [{ bookingId: 'hold', eventName: null, status: BookingStatus.HELD, ...window }],
            blocks: [{ blockId: 'x', reason: null, ...window }],
          } as never,
          new Set(),
        ),
      ).toEqual([
        'Main Hall has a tentative hold for "another event" at the new time (setup and turnaround included).',
        'Main Hall is unavailable at the new time.',
      ]);

      const check = summarise({
        newWindow: window,
        venueBookings: [venue({ venueName: null })],
        equipmentReservations: [],
        equipment: [],
        warnings: [],
      });
      expect(check.works[0].label).toBe('Venue booking at the booked venue');
    });
  });

  describe('US-48 AC-3: equipment shortfalls', () => {
    it('is no conflict when the quantity is free', () => {
      expect(equipmentShortfall(availability(6, 0))).toBeNull();
    });

    it('says how many are free when another event holds some', () => {
      expect(equipmentShortfall(availability(6, 2))).toBe(
        'Only 4 of 6 Projector free for the new time.',
      );
    });

    it.each([
      [EquipmentStatus.OUT_OF_SERVICE, 'damaged'],
      [EquipmentStatus.UNDER_MAINTENANCE, 'under maintenance'],
    ])('says a %s item has nothing available', (status, word) => {
      expect(equipmentShortfall(availability(1, 0, status))).toBe(
        `Projector is ${word}, so none is available for the new time.`,
      );
    });
  });

  describe('US-48 AC-4: the summary of what works and what conflicts', () => {
    it('sorts every arrangement, with a reason for each conflict', () => {
      const check = summarise({
        newWindow: window,
        venueBookings: [
          venue(),
          venue({
            bookingId: 'b2',
            venueName: 'Annex',
            available: false,
            conflicts: ['Annex is unavailable at the new time (Renovation).'],
          }),
        ],
        equipmentReservations: [
          {
            equipmentId: 'eq',
            equipmentType: 'Projector',
            reservationIds: ['r1'],
            quantity: 6,
            status: ReservationStatus.APPROVED,
            current: window,
            proposed: window,
            available: false,
            reason: 'Only 4 of 6 Projector free for the new time.',
          },
        ],
        equipment: [
          {
            equipmentId: 'mic',
            equipmentType: 'Microphone',
            quantity: 2,
            availableQuantity: 10,
            available: true,
            reason: null,
          },
        ],
        warnings: [],
      });

      expect(check.works).toEqual([
        { kind: 'VENUE_BOOKING', label: 'Venue booking at Main Hall', reason: null },
        { kind: 'EQUIPMENT', label: '2 × Microphone', reason: null },
      ]);
      expect(check.conflicts).toEqual([
        {
          kind: 'VENUE_BOOKING',
          label: 'Venue booking at Annex',
          reason: 'Annex is unavailable at the new time (Renovation).',
        },
        {
          kind: 'EQUIPMENT_RESERVATION',
          label: '6 × Projector reservation',
          reason: 'Only 4 of 6 Projector free for the new time.',
        },
      ]);
      expect(check.canApprove).toBe(false);
    });

    it('US-48 AC-2: a capacity shortfall alone never blocks approval', () => {
      const check = summarise({
        newWindow: null,
        venueBookings: [venue({ moves: false, capacityWarning: 'Too small.' })],
        equipmentReservations: [],
        equipment: [],
        warnings: [
          {
            type: 'CAPACITY_EXCEEDED',
            bookingId: 'b1',
            bookingStatus: 'APPROVED',
            venueId: 'v1',
            venueName: 'Main Hall',
            capacity: 100,
            proposedAttendance: 150,
            message: 'Too small.',
          },
        ],
      });

      expect(check.canApprove).toBe(true);
      expect(check.conflicts).toEqual([]);
      expect(check.warnings).toHaveLength(1);
    });

    it('an event with nothing booked has nothing to conflict', () => {
      const check = summarise({
        newWindow: window,
        venueBookings: [],
        equipmentReservations: [],
        equipment: [],
        warnings: [],
      });
      expect(check).toMatchObject({ works: [], conflicts: [], canApprove: true });
    });
  });

  it('US-48 AC-8: a refused approval lists every conflict, and says nothing changed', () => {
    expect(
      refusedApprovalMessage([
        { kind: 'VENUE_BOOKING', label: 'x', reason: 'Annex is unavailable at the new time.' },
        { kind: 'EQUIPMENT', label: 'y', reason: 'Only 4 of 6 Projector free for the new time.' },
      ]),
    ).toBe(
      'Cannot approve: the arrangements no longer fit the requested details, so nothing was changed and the request is still pending. Annex is unavailable at the new time. Only 4 of 6 Projector free for the new time.',
    );
  });
});
