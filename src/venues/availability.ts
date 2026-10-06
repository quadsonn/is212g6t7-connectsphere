import { BadRequestException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

import { VenueBookingSlot } from '../bookings/booking-impact';

/**
 * US-17 — a venue's availability calendar, reduced to one status per day.
 *
 * Pure functions only: no Prisma, no clock. The service supplies the slots and
 * "now", which is what lets the aggregation be unit-tested exhaustively.
 */

/** AC-3/AC-4 — what a Coordinator may learn about one day, and nothing more. */
export enum DayStatus {
  FREE = 'free',
  TENTATIVE = 'tentative',
  BOOKED = 'booked',
}

/** A calendar day, as an ISO date string ("2026-10-03") in venue time. */
export type DayKey = string;

export interface DayAvailability {
  date: DayKey;
  status: DayStatus;
}

/** An inclusive range of calendar days in venue time. */
export interface DayRange {
  from: DayKey;
  to: DayKey;
}

/**
 * Days are bucketed in Singapore time, whatever the server's TZ.
 *
 * Singapore has no daylight saving, so a fixed offset is exact — no timezone
 * library is needed. AMBIGUOUS: a single business timezone for every venue.
 * If venues outside Singapore are ever catalogued, this has to become a
 * per-venue setting.
 */
export const VENUE_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Longest range one request may cover: two consecutive 31-day months, which
 * is exactly the AC-1 default at its largest. Keeps a single call cheap
 * enough for AC-2's two-second budget.
 */
export const MAX_RANGE_DAYS = 62;

/** Stronger signals outrank weaker ones when a day has several bookings. */
const RANK: Record<DayStatus, number> = {
  [DayStatus.FREE]: 0,
  [DayStatus.TENTATIVE]: 1,
  [DayStatus.BOOKED]: 2,
};

/** The venue-time calendar day an instant falls on. */
export function dayKeyOf(instant: Date): DayKey {
  return new Date(instant.getTime() + VENUE_UTC_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** The instant venue-time midnight begins on this day. */
export function startOfDay(day: DayKey): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - VENUE_UTC_OFFSET_MS);
}

function addDays(day: DayKey, days: number): DayKey {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function lastDayOfMonth(month: string): DayKey {
  const [year, monthIndex] = month.split('-').map(Number);
  // Day 0 of the following month is the last day of this one.
  return new Date(Date.UTC(year, monthIndex, 0)).toISOString().slice(0, 10);
}

function isRealDay(day: DayKey): boolean {
  const parsed = Date.parse(`${day}T00:00:00Z`);
  return (
    !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === day
  );
}

/** Instants covered by an inclusive day range, as a half-open [from, to). */
export function rangeBounds(range: DayRange): { from: Date; to: Date } {
  return { from: startOfDay(range.from), to: startOfDay(addDays(range.to, 1)) };
}

/**
 * Turns the query into an inclusive day range.
 *
 * AC-1: with no parameters, the current month and the next one. AC-2: a single
 * month per call is supported so each month loads independently.
 */
export function resolveRange(
  query: { month?: string; from?: string; to?: string },
  now: Date,
): DayRange {
  const { month, from, to } = query;

  if (month && (from || to)) {
    throw new BadRequestException('give either month or from/to, not both');
  }

  if (month) {
    return { from: `${month}-01`, to: lastDayOfMonth(month) };
  }

  if (from || to) {
    if (!from || !to) {
      throw new BadRequestException('from and to must be given together');
    }
    if (!isRealDay(from) || !isRealDay(to)) {
      throw new BadRequestException('from and to must be real calendar dates');
    }
    if (to < from) {
      throw new BadRequestException('to must not be earlier than from');
    }
    const span = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
    if (span > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `a range may cover at most ${MAX_RANGE_DAYS} days`,
      );
    }
    return { from, to };
  }

  const today = dayKeyOf(now);
  const thisMonth = today.slice(0, 7);
  const nextMonth = addDays(lastDayOfMonth(thisMonth), 1).slice(0, 7);
  return { from: `${thisMonth}-01`, to: lastDayOfMonth(nextMonth) };
}

/** What a single booking contributes to each day it touches. */
function statusFor(booking: VenueBookingSlot): DayStatus {
  switch (booking.status) {
    case BookingStatus.APPROVED:
      return DayStatus.BOOKED;
    case BookingStatus.REQUESTED:
      return DayStatus.TENTATIVE;
    default:
      // REJECTED holds nothing. The query already excludes it; this guards
      // against a caller that does not.
      return DayStatus.FREE;
  }
}

/**
 * AC-3/AC-4 — one status per day in the range.
 *
 * A booking touches every day from the one it starts on to the one containing
 * its last instant. End is exclusive, so a booking ending exactly at midnight
 * does not touch the following day. Booked outranks tentative, which outranks
 * free.
 */
export function aggregateAvailability(
  range: DayRange,
  bookings: VenueBookingSlot[],
): DayAvailability[] {
  const days = new Map<DayKey, DayStatus>();
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    days.set(day, DayStatus.FREE);
  }

  for (const booking of bookings) {
    const status = statusFor(booking);
    if (status === DayStatus.FREE) continue;

    const first = dayKeyOf(booking.start);
    const lastInstant = Math.max(
      booking.start.getTime(),
      booking.end.getTime() - 1,
    );
    const last = dayKeyOf(new Date(lastInstant));

    const from = first > range.from ? first : range.from;
    const to = last < range.to ? last : range.to;

    for (let day = from; day <= to; day = addDays(day, 1)) {
      if (RANK[status] > RANK[days.get(day)!]) {
        days.set(day, status);
      }
    }
  }

  return [...days].map(([date, status]) => ({ date, status }));
}
