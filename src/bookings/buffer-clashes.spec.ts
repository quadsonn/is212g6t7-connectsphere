import { windowsOverlap } from './booking-overlap';
import { ClashCandidate, clashingIds, findClashingPairs, newClashes } from './buffer-clashes';

/** US-51 — which bookings a buffer change puts in conflict. */
describe('buffer clashes (US-51)', () => {
  const at = (time: string, day = '2030-10-01') => new Date(`${day}T${time}:00Z`);
  const NOW = at('08:00');
  const NONE = { setupMinutes: 0, turnaroundMinutes: 0 };
  const CUSTOMER = { setupMinutes: 30, turnaroundMinutes: 45 };

  const booking = (id: string, start: string, end: string, day?: string): ClashCandidate => ({
    id,
    eventName: `Event ${id}`,
    start: at(start, day),
    end: at(end, day),
  });

  const pairIds = (pairs: [ClashCandidate, ClashCandidate][]) =>
    pairs.map(([a, b]) => [a.id, b.id].sort().join('+')).sort();

  describe('windowsOverlap — the shared half-open rule, in memory', () => {
    it('US-51: windows that only touch do not overlap', () => {
      expect(windowsOverlap({ start: at('09:00'), end: at('10:00') }, { start: at('10:00'), end: at('11:00') })).toBe(false);
    });

    it('US-51: windows sharing a minute overlap, either way round', () => {
      const a = { start: at('09:00'), end: at('10:01') };
      const b = { start: at('10:00'), end: at('11:00') };
      expect(windowsOverlap(a, b)).toBe(true);
      expect(windowsOverlap(b, a)).toBe(true);
    });
  });

  describe('findClashingPairs', () => {
    const morning = booking('a', '10:00', '12:00');
    const lunch = booking('b', '12:30', '14:00');

    it('US-51: the customer example clashes at 30/45 (12:45 > 12:00)', () => {
      expect(pairIds(findClashingPairs([morning, lunch], CUSTOMER))).toEqual(['a+b']);
    });

    it('US-51: the same bookings do not clash with no buffers', () => {
      expect(findClashingPairs([morning, lunch], NONE)).toEqual([]);
    });

    it('US-51: padded windows that only touch do not clash', () => {
      // a pads to 09:30-12:45; c pads to 12:45-14:45.
      expect(findClashingPairs([morning, booking('c', '13:15', '14:00')], CUSTOMER)).toEqual([]);
    });

    it('US-51: finds every pair, whatever order the bookings arrive in', () => {
      const all = [booking('c', '13:00', '15:00'), lunch, morning];
      expect(pairIds(findClashingPairs(all, CUSTOMER))).toEqual(['a+b', 'a+c', 'b+c']);
    });

    it('US-51: a long booking clashes with a later one beyond its neighbour', () => {
      const long = booking('long', '09:00', '18:00');
      const all = [long, booking('x', '10:00', '11:00'), booking('y', '16:00', '17:00')];
      expect(pairIds(findClashingPairs(all, NONE))).toEqual(['long+x', 'long+y']);
    });
  });

  describe('newClashes', () => {
    it('US-51: lists both bookings of the customer example, each against the other', () => {
      const clashes = newClashes(
        [booking('a', '10:00', '12:00'), booking('b', '12:30', '14:00')],
        NONE,
        CUSTOMER,
        NOW,
      );

      expect(clashes).toEqual([
        {
          bookingId: 'a',
          eventName: 'Event a',
          start: at('10:00'),
          end: at('12:00'),
          clashesWith: { bookingId: 'b', eventName: 'Event b', start: at('12:30'), end: at('14:00') },
        },
        {
          bookingId: 'b',
          eventName: 'Event b',
          start: at('12:30'),
          end: at('14:00'),
          clashesWith: { bookingId: 'a', eventName: 'Event a', start: at('10:00'), end: at('12:00') },
        },
      ]);
    });

    it('US-51: a pair that already clashed under the current buffers is not new', () => {
      // A US-24 soft overlap between two pending requests.
      const overlapping = [booking('a', '10:00', '12:00'), booking('b', '11:00', '13:00')];
      expect(newClashes(overlapping, NONE, CUSTOMER, NOW)).toEqual([]);
    });

    it('US-51: lowering a buffer never produces a clash', () => {
      const bookings = [booking('a', '10:00', '12:00'), booking('b', '12:30', '14:00')];
      expect(newClashes(bookings, CUSTOMER, NONE, NOW)).toEqual([]);
    });

    it('US-51 AC-2: an in-progress booking is a counterpart but is never itself flagged', () => {
      const inProgress = booking('now', '07:00', '09:00');
      const next = booking('next', '09:30', '11:00');

      const clashes = newClashes([inProgress, next], NONE, CUSTOMER, NOW);

      expect(clashes.map((c) => [c.bookingId, c.clashesWith.bookingId])).toEqual([['next', 'now']]);
    });

    it('US-51 AC-1: a booking starting exactly now is not in the future, so not flagged', () => {
      const startsNow = booking('a', '08:00', '09:00');
      const next = booking('b', '09:30', '10:00');

      const clashes = newClashes([startsNow, next], NONE, CUSTOMER, NOW);

      expect(clashes.map((c) => c.bookingId)).toEqual(['b']);
    });
  });

  describe('clashingIds', () => {
    it('US-51: the ids still in some clash under the given buffers', () => {
      const bookings = [booking('a', '10:00', '12:00'), booking('b', '12:30', '14:00'), booking('c', '18:00', '19:00')];
      expect([...clashingIds(bookings, CUSTOMER)].sort()).toEqual(['a', 'b']);
      expect(clashingIds(bookings, NONE).size).toBe(0);
    });
  });
});
