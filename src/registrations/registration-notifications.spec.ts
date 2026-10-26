import {
  isNearCapacity,
  NEAR_CAPACITY_SEATS_REMAINING,
  venueCapacityOf,
} from './registration-notifications';

describe('registration-window notice rules', () => {
  describe('venueCapacityOf', () => {
    it('sums the capacities of the approved venues', () => {
      expect(venueCapacityOf([100, 50])).toBe(150);
    });

    it('ignores venues whose capacity is unknown', () => {
      expect(venueCapacityOf([100, null, 50])).toBe(150);
    });

    it('is null when no capacity is known — nothing to measure against', () => {
      expect(venueCapacityOf([])).toBeNull();
      expect(venueCapacityOf([null, null])).toBeNull();
    });
  });

  describe('isNearCapacity', () => {
    it('is false when there is no known capacity', () => {
      expect(isNearCapacity(null, 0)).toBe(false);
    });

    it('is false while more than the margin of seats remain', () => {
      // 100 capacity, 89 registered → 11 left (> 10).
      expect(isNearCapacity(100, 89)).toBe(false);
    });

    it('is true at exactly the margin of seats left', () => {
      // 100 capacity, 90 registered → 10 left.
      expect(isNearCapacity(100, 90)).toBe(true);
    });

    it('is true when full or over capacity (a venue shrank below the headcount)', () => {
      expect(isNearCapacity(100, 100)).toBe(true);
      expect(isNearCapacity(40, 60)).toBe(true);
    });

    it('uses a margin of 10', () => {
      expect(NEAR_CAPACITY_SEATS_REMAINING).toBe(10);
    });
  });
});
