import { BadRequestException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

import { VenueBookingSlot } from '../bookings/booking-impact';
import {
  DayStatus,
  aggregateAvailability,
  dayKeyOf,
  rangeBounds,
  resolveRange,
} from './availability';

/** US-17 — the per-day aggregation behind the venue availability calendar. */
describe('US-17 venue availability aggregation', () => {
  /** A slot given in Singapore local time, which is how staff think of it. */
  const slot = (
    start: string,
    end: string,
    status: BookingStatus,
  ): VenueBookingSlot => ({
    start: new Date(`${start}+08:00`),
    end: new Date(`${end}+08:00`),
    status,
  });

  const OCTOBER = { from: '2026-10-01', to: '2026-10-31' };

  const statusOn = (
    day: string,
    bookings: VenueBookingSlot[],
    range = OCTOBER,
  ) => aggregateAvailability(range, bookings).find((d) => d.date === day)?.status;

  describe('AC-1: every day in the range is reported', () => {
    it('returns one entry per day, in order, free when nothing is booked', () => {
      const days = aggregateAvailability(OCTOBER, []);

      expect(days).toHaveLength(31);
      expect(days[0]).toEqual({ date: '2026-10-01', status: DayStatus.FREE });
      expect(days[30]).toEqual({ date: '2026-10-31', status: DayStatus.FREE });
    });

    it('handles a February in a leap year', () => {
      expect(
        aggregateAvailability({ from: '2028-02-01', to: '2028-02-29' }, []),
      ).toHaveLength(29);
    });
  });

  describe('AC-3: a confirmed booking marks the day booked', () => {
    it('marks a day with only an APPROVED booking as booked', () => {
      const bookings = [
        slot('2026-10-10T09:00:00', '2026-10-10T17:00:00', BookingStatus.APPROVED),
      ];

      expect(statusOn('2026-10-10', bookings)).toBe(DayStatus.BOOKED);
      expect(statusOn('2026-10-09', bookings)).toBe(DayStatus.FREE);
      expect(statusOn('2026-10-11', bookings)).toBe(DayStatus.FREE);
    });

    it('reports booked over tentative when a day has both', () => {
      const bookings = [
        slot('2026-10-10T09:00:00', '2026-10-10T12:00:00', BookingStatus.REQUESTED),
        slot('2026-10-10T14:00:00', '2026-10-10T17:00:00', BookingStatus.APPROVED),
      ];

      expect(statusOn('2026-10-10', bookings)).toBe(DayStatus.BOOKED);
    });

    it('is not downgraded by a later pending request on the same day', () => {
      const bookings = [
        slot('2026-10-10T09:00:00', '2026-10-10T12:00:00', BookingStatus.APPROVED),
        slot('2026-10-10T14:00:00', '2026-10-10T17:00:00', BookingStatus.REQUESTED),
      ];

      expect(statusOn('2026-10-10', bookings)).toBe(DayStatus.BOOKED);
    });

    it('carries nothing but date and status', () => {
      const days = aggregateAvailability(OCTOBER, [
        slot('2026-10-10T09:00:00', '2026-10-10T17:00:00', BookingStatus.APPROVED),
      ]);

      for (const day of days) {
        expect(Object.keys(day).sort()).toEqual(['date', 'status']);
      }
    });
  });

  describe('AC-4: pending-only days are tentative', () => {
    it('marks a day with only a REQUESTED booking as tentative', () => {
      const bookings = [
        slot('2026-10-10T09:00:00', '2026-10-10T17:00:00', BookingStatus.REQUESTED),
      ];

      expect(statusOn('2026-10-10', bookings)).toBe(DayStatus.TENTATIVE);
    });

    it('leaves a day with only a REJECTED booking free', () => {
      const bookings = [
        slot('2026-10-10T09:00:00', '2026-10-10T17:00:00', BookingStatus.REJECTED),
      ];

      expect(statusOn('2026-10-10', bookings)).toBe(DayStatus.FREE);
    });
  });

  describe('AC-1: blocked-off periods are shown', () => {
    /** A block given in Singapore local time. */
    const block = (start: string, end: string) => ({
      start: new Date(`${start}+08:00`),
      end: new Date(`${end}+08:00`),
    });

    const statusWithBlocks = (
      day: string,
      bookings: VenueBookingSlot[],
      blocks: { start: Date; end: Date }[],
    ) => aggregateAvailability(OCTOBER, bookings, blocks).find((d) => d.date === day)?.status;

    it('Given a block on a day, Then that day is blocked', () => {
      const blocks = [block('2026-10-10T09:00:00', '2026-10-10T12:00:00')];

      expect(statusWithBlocks('2026-10-10', [], blocks)).toBe(DayStatus.BLOCKED);
      expect(statusWithBlocks('2026-10-09', [], blocks)).toBe(DayStatus.FREE);
      expect(statusWithBlocks('2026-10-11', [], blocks)).toBe(DayStatus.FREE);
    });

    it('Given a block over several days, Then every day it touches is blocked', () => {
      const blocks = [block('2026-10-10T18:00:00', '2026-10-13T00:00:00')];

      expect(statusWithBlocks('2026-10-10', [], blocks)).toBe(DayStatus.BLOCKED);
      expect(statusWithBlocks('2026-10-12', [], blocks)).toBe(DayStatus.BLOCKED);
      // Ends exactly at midnight: the 13th is untouched.
      expect(statusWithBlocks('2026-10-13', [], blocks)).toBe(DayStatus.FREE);
    });

    it('Given a block and a booking on the same day, Then blocked outranks booked, whatever the order', () => {
      const blocks = [block('2026-10-10T14:00:00', '2026-10-10T17:00:00')];
      const bookings = [
        slot('2026-10-10T09:00:00', '2026-10-10T12:00:00', BookingStatus.APPROVED),
      ];

      expect(statusWithBlocks('2026-10-10', bookings, blocks)).toBe(DayStatus.BLOCKED);
    });

    it('Given a block reaching outside the range, Then only days in the range are reported', () => {
      const days = aggregateAvailability(OCTOBER, [], [
        block('2026-09-25T00:00:00', '2026-10-02T12:00:00'),
      ]);

      expect(days).toHaveLength(31);
      expect(days[0]).toEqual({ date: '2026-10-01', status: DayStatus.BLOCKED });
      expect(days[1]).toEqual({ date: '2026-10-02', status: DayStatus.BLOCKED });
      expect(days[2]).toEqual({ date: '2026-10-03', status: DayStatus.FREE });
    });

    it('carries nothing but date and status for a blocked day', () => {
      const days = aggregateAvailability(OCTOBER, [], [
        block('2026-10-10T09:00:00', '2026-10-10T12:00:00'),
      ]);

      expect(Object.keys(days[9]).sort()).toEqual(['date', 'status']);
    });
  });

  describe('bookings that cross day and month boundaries', () => {
    it('marks both days of a booking that spans midnight', () => {
      const bookings = [
        slot('2026-10-10T22:00:00', '2026-10-11T02:00:00', BookingStatus.APPROVED),
      ];

      expect(statusOn('2026-10-10', bookings)).toBe(DayStatus.BOOKED);
      expect(statusOn('2026-10-11', bookings)).toBe(DayStatus.BOOKED);
      expect(statusOn('2026-10-12', bookings)).toBe(DayStatus.FREE);
    });

    it('marks every day of a multi-day booking', () => {
      const bookings = [
        slot('2026-10-10T09:00:00', '2026-10-13T17:00:00', BookingStatus.REQUESTED),
      ];

      for (const day of ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']) {
        expect(statusOn(day, bookings)).toBe(DayStatus.TENTATIVE);
      }
      expect(statusOn('2026-10-14', bookings)).toBe(DayStatus.FREE);
    });

    it('does not mark the next day for a booking ending exactly at midnight', () => {
      const bookings = [
        slot('2026-10-10T18:00:00', '2026-10-11T00:00:00', BookingStatus.APPROVED),
      ];

      expect(statusOn('2026-10-10', bookings)).toBe(DayStatus.BOOKED);
      expect(statusOn('2026-10-11', bookings)).toBe(DayStatus.FREE);
    });

    it('marks the last day of the month for a booking ending 23:59 on it', () => {
      const bookings = [
        slot('2026-10-31T20:00:00', '2026-10-31T23:59:00', BookingStatus.APPROVED),
      ];

      expect(statusOn('2026-10-31', bookings)).toBe(DayStatus.BOOKED);
    });

    it('clips a booking that runs into the next month to the queried range', () => {
      const days = aggregateAvailability(OCTOBER, [
        slot('2026-10-30T09:00:00', '2026-11-02T17:00:00', BookingStatus.APPROVED),
      ]);

      expect(days).toHaveLength(31);
      expect(days.at(-1)).toEqual({ date: '2026-10-31', status: DayStatus.BOOKED });
    });

    it('marks the first day for a booking that started last month', () => {
      const bookings = [
        slot('2026-09-29T09:00:00', '2026-10-01T10:00:00', BookingStatus.REQUESTED),
      ];

      expect(statusOn('2026-10-01', bookings)).toBe(DayStatus.TENTATIVE);
      expect(statusOn('2026-10-02', bookings)).toBe(DayStatus.FREE);
    });

    it('buckets by Singapore time, not UTC', () => {
      // 01:00 SGT on the 11th is 17:00 UTC on the 10th.
      const bookings = [
        slot('2026-10-11T01:00:00', '2026-10-11T03:00:00', BookingStatus.APPROVED),
      ];

      expect(statusOn('2026-10-10', bookings)).toBe(DayStatus.FREE);
      expect(statusOn('2026-10-11', bookings)).toBe(DayStatus.BOOKED);
    });
  });

  describe('resolveRange', () => {
    const NOW = new Date('2026-10-15T12:00:00+08:00');

    it('AC-1: defaults to the current month and the next one', () => {
      expect(resolveRange({}, NOW)).toEqual({ from: '2026-10-01', to: '2026-11-30' });
    });

    it('AC-1: rolls the default over a year end', () => {
      expect(resolveRange({}, new Date('2026-12-05T12:00:00+08:00'))).toEqual({
        from: '2026-12-01',
        to: '2027-01-31',
      });
    });

    it('AC-1: takes "current month" from Singapore time', () => {
      // 30 Sep 18:00 UTC is already 1 Oct in Singapore.
      expect(resolveRange({}, new Date('2026-09-30T18:00:00Z')).from).toBe('2026-10-01');
    });

    it('AC-2: loads a single month on its own', () => {
      expect(resolveRange({ month: '2027-02' }, NOW)).toEqual({
        from: '2027-02-01',
        to: '2027-02-28',
      });
    });

    it('accepts an explicit day range', () => {
      expect(resolveRange({ from: '2026-10-05', to: '2026-10-20' }, NOW)).toEqual({
        from: '2026-10-05',
        to: '2026-10-20',
      });
    });

    it.each([
      [{ month: '2026-10', from: '2026-10-01', to: '2026-10-31' }],
      [{ from: '2026-10-01' }],
      [{ to: '2026-10-31' }],
      [{ from: '2026-10-20', to: '2026-10-05' }],
      [{ from: '2026-02-30', to: '2026-03-05' }],
      [{ from: '2026-01-01', to: '2026-03-31' }],
    ])('rejects %j', (query) => {
      expect(() => resolveRange(query, NOW)).toThrow(BadRequestException);
    });
  });

  describe('rangeBounds', () => {
    it('spans Singapore midnight to the midnight after the last day', () => {
      const { from, to } = rangeBounds({ from: '2026-10-01', to: '2026-10-31' });

      expect(from.toISOString()).toBe('2026-09-30T16:00:00.000Z');
      expect(to.toISOString()).toBe('2026-10-31T16:00:00.000Z');
      expect(dayKeyOf(from)).toBe('2026-10-01');
    });
  });
});
