import { capacityWarnings } from '../events/change-request.rules';
import { capacityShortfall, exceedsCapacity } from './capacity';

/**
 * The capacity rule shared by booking requests, suggestions, the request
 * page's warning and US-48's change request re-check.
 *
 * Capacity AC-1: a request is allowed only when capacity >= attendance.
 * Capacity AC-2: the shortfall is explained.
 */
describe('capacity rule', () => {
  describe('Capacity AC-1: attendance must not exceed capacity', () => {
    it.each([
      [90, 499, true],
      [90, 91, true],
      [90, 90, false],
      [90, 89, false],
    ])('capacity %i, attendance %i → over capacity: %s', (capacity, attendance, over) => {
      expect(exceedsCapacity(capacity, attendance)).toBe(over);
    });

    it('cannot compare a venue with no capacity, or a request with no attendance', () => {
      expect(exceedsCapacity(null, 499)).toBe(false);
      expect(exceedsCapacity(undefined, 499)).toBe(false);
      expect(exceedsCapacity(90, null)).toBe(false);
    });
  });

  describe('Capacity AC-2: the shortfall is explained', () => {
    it('names the venue, its capacity and the expected attendance', () => {
      expect(capacityShortfall({ name: 'Alumni Lounge', capacity: 90 }, 499)).toEqual({
        venueName: 'Alumni Lounge',
        capacity: 90,
        attendance: 499,
        message: 'Alumni Lounge holds 90, but expected attendance is 499.',
      });
    });

    it('is null when the venue fits, exactly or with room to spare', () => {
      expect(capacityShortfall({ name: 'Alumni Lounge', capacity: 90 }, 90)).toBeNull();
      expect(capacityShortfall({ name: 'Alumni Lounge', capacity: 90 }, 50)).toBeNull();
    });
  });

  describe("Capacity rule matches US-48's change request re-check", () => {
    // US-48 warns where a booking is blocked: the same cases, both ways.
    it.each([
      [90, 499],
      [90, 91],
      [90, 90],
      [90, 89],
      [null, 499],
    ])(
      'capacity %s, attendance %i: US-48 warns exactly when a request is blocked',
      (capacity, attendance) => {
        const warned =
          capacityWarnings(attendance, [
            { id: 'b1', status: 'APPROVED', venue: { id: 'v1', name: 'Alumni Lounge', capacity } },
          ]).length > 0;

        expect(warned).toBe(
          capacityShortfall({ name: 'Alumni Lounge', capacity }, attendance) !== null,
        );
      },
    );
  });
});
