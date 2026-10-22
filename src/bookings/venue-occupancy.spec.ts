import { BookingStatus } from '@prisma/client';

import { aggregateAvailability, DayStatus } from '../venues/availability';
import {
  bookingsClash,
  bookingsOccupyingWhere,
  buffersOf,
  clashingBlocksWhere,
  clashingBookingsWhere,
  NO_BUFFERS,
  occupancySegments,
  occupiedWindow,
  periodClashesWith,
  VenueBuffers,
  windowsOverlap,
} from './venue-occupancy';

const at = (hhmm: string, day = '2030-10-01') => new Date(`${day}T${hhmm}:00.000Z`);
const slot = (from: string, to: string, day?: string) => ({ start: at(from, day), end: at(to, day) });

/** The customer's example: 30 minutes' setup, 45 minutes' turnaround. */
const EXAMPLE: VenueBuffers = { setupMinutes: 30, turnaroundMinutes: 45 };

/** Evaluates a { start: { lt }, end: { gt } } filter against a row, as Postgres would. */
const matches = (
  where: { start?: unknown; end?: unknown },
  row: { start: Date; end: Date },
): boolean => {
  const { start, end } = where as { start: { lt: Date }; end: { gt: Date } };
  return row.start.getTime() < start.lt.getTime() && row.end.getTime() > end.gt.getTime();
};

/** US-50 — the shared buffer-aware occupancy rule. Tagged "US-50 AC-n". */
describe('US-50 venue occupancy (setup and turnaround buffers)', () => {
  describe('US-50 AC-1: a booking occupies its setup time before and turnaround after', () => {
    it('10:00–12:00 with 30 min setup and 45 min turnaround occupies 09:30–12:45', () => {
      expect(occupiedWindow(slot('10:00', '12:00'), EXAMPLE)).toEqual(slot('09:30', '12:45'));
    });

    it('marks the next day too when the turnaround runs past midnight', () => {
      const days = aggregateAvailability({ from: '2030-10-01', to: '2030-10-02' }, [
        {
          // 22:00–23:30 Singapore time = 14:00–15:30Z; 45 min turnaround ends 00:15.
          start: at('14:00'),
          end: at('15:30'),
          status: BookingStatus.APPROVED,
          buffers: EXAMPLE,
        },
      ]);

      expect(days).toEqual([
        { date: '2030-10-01', status: DayStatus.BOOKED },
        { date: '2030-10-02', status: DayStatus.BOOKED },
      ]);
    });

    it('leaves the next day free without buffers, as before', () => {
      const days = aggregateAvailability({ from: '2030-10-01', to: '2030-10-02' }, [
        { start: at('14:00'), end: at('15:30'), status: BookingStatus.APPROVED },
      ]);

      expect(days.map((d) => d.status)).toEqual([DayStatus.BOOKED, DayStatus.FREE]);
    });
  });

  describe("US-50 AC-2: a request clashing with another booking's setup or turnaround is a conflict", () => {
    const existing = slot('10:00', '12:00');

    it("clashes with the existing booking's turnaround window only (12:00–12:45)", () => {
      // Its setup starts 12:30, inside the existing turnaround (12:00–12:45).
      const request = slot('13:00', '14:00');
      expect(windowsOverlap(request, existing)).toBe(false); // event times alone are clear
      expect(bookingsClash(request, existing, EXAMPLE)).toBe(true);
    });

    it("clashes with the existing booking's setup window only (09:30–10:00)", () => {
      const request = slot('08:00', '09:15'); // turnaround to 10:00 runs into setup at 09:30
      expect(windowsOverlap(request, existing)).toBe(false);
      expect(bookingsClash(request, existing, EXAMPLE)).toBe(true);
    });

    it('a request entirely inside the turnaround buffer clashes', () => {
      expect(periodClashesWith(slot('12:10', '12:40'), existing, EXAMPLE)).toBe(true);
    });

    it('touching occupied windows do not clash (half-open, the existing convention)', () => {
      // Existing occupies 09:30–12:45; this one occupies 12:45–14:45.
      const request = slot('13:15', '14:00');
      expect(occupiedWindow(request, EXAMPLE).start).toEqual(at('12:45'));
      expect(bookingsClash(request, existing, EXAMPLE)).toBe(false);
    });

    it('the database filter selects exactly the bookings the rule says clash', () => {
      const candidates = [
        slot('06:00', '07:00'),
        slot('07:00', '08:45'),
        slot('07:00', '08:46'),
        slot('08:00', '09:15'),
        slot('09:00', '11:00'),
        slot('12:00', '13:00'),
        slot('13:14', '14:00'),
        slot('13:15', '14:00'),
        slot('15:00', '16:00'),
      ];
      const where = clashingBookingsWhere(existing, EXAMPLE);

      for (const candidate of candidates) {
        expect([candidate, matches(where, candidate)]).toEqual([
          candidate,
          bookingsClash(existing, candidate, EXAMPLE),
        ]);
      }
    });

    it('the block filter and the occupied-period filter agree with the rule', () => {
      const blocks = [slot('09:00', '09:31'), slot('09:00', '09:30'), slot('12:44', '13:00'), slot('12:45', '13:00')];
      const blockWhere = clashingBlocksWhere(existing, EXAMPLE);
      for (const block of blocks) {
        expect(matches(blockWhere, block)).toBe(periodClashesWith(block, existing, EXAMPLE));
      }

      const bookings = [slot('12:30', '13:00'), slot('12:46', '13:00'), slot('08:00', '09:00'), slot('08:00', '08:45')];
      const period = slot('09:30', '12:00'); // e.g. a blocked-out period
      const occupyingWhere = bookingsOccupyingWhere(period, EXAMPLE);
      for (const booking of bookings) {
        expect(matches(occupyingWhere, booking)).toBe(periodClashesWith(period, booking, EXAMPLE));
      }
    });
  });

  describe('US-50 AC-3: buffers are reported separately from the event time', () => {
    it('splits a booking into setup, event and turnaround segments', () => {
      expect(occupancySegments(slot('10:00', '12:00'), EXAMPLE)).toEqual([
        { kind: 'SETUP', start: at('09:30'), end: at('10:00') },
        { kind: 'EVENT', start: at('10:00'), end: at('12:00') },
        { kind: 'TURNAROUND', start: at('12:00'), end: at('12:45') },
      ]);
    });

    it('omits a buffer that is zero', () => {
      expect(
        occupancySegments(slot('10:00', '12:00'), { setupMinutes: 0, turnaroundMinutes: 15 }).map(
          (s) => s.kind,
        ),
      ).toEqual(['EVENT', 'TURNAROUND']);
    });
  });

  describe('US-50 AC-4: venues without configured buffers fall back to zero', () => {
    it.each([
      [null],
      [undefined],
      [{}],
      [{ setupMinutes: null, turnaroundMinutes: null }],
    ])('treats %j as no buffers', (venue) => {
      expect(buffersOf(venue)).toEqual(NO_BUFFERS);
    });

    it('never lets a negative value shrink the event', () => {
      expect(buffersOf({ setupMinutes: -10, turnaroundMinutes: 5 })).toEqual({
        setupMinutes: 0,
        turnaroundMinutes: 5,
      });
    });

    it('with zero buffers the rule is exactly the old plain overlap', () => {
      const existing = slot('10:00', '12:00');
      expect(bookingsClash(slot('12:00', '13:00'), existing, NO_BUFFERS)).toBe(false);
      expect(bookingsClash(slot('11:59', '13:00'), existing, NO_BUFFERS)).toBe(true);
      expect(clashingBookingsWhere(existing, NO_BUFFERS)).toEqual({
        start: { lt: at('12:00') },
        end: { gt: at('10:00') },
      });
    });
  });
});
