import { describe, it, expect } from 'vitest';

import {
  instantToLocalString,
  isoToLocalParts,
  localStringToInstant,
  partsToInstant,
} from './date-time';

/**
 * Event/booking times are authored in Singapore (GMT+8). These assertions are
 * absolute instants, independent of the machine's own timezone — a regression
 * to browser-local getters (getHours, etc.) would change them when the suite
 * runs under a non-UTC TZ, which is the point.
 */
describe('Singapore-anchored date-time conversion', () => {
  it('reads a typed time as Singapore when making the instant', () => {
    // 09:00 in Singapore is 01:00 UTC.
    expect(partsToInstant('2026-11-12', '09:00')).toBe('2026-11-12T01:00:00.000Z');
    expect(localStringToInstant('2026-11-12T09:00')).toBe('2026-11-12T01:00:00.000Z');
  });

  it('shows a stored instant back in Singapore time', () => {
    expect(instantToLocalString('2026-11-12T01:00:00.000Z')).toBe('2026-11-12T09:00');
    expect(isoToLocalParts('2026-11-12T01:00:00.000Z')).toEqual({
      date: '2026-11-12',
      time: '09:00',
    });
  });

  it('crosses midnight correctly (late-evening UTC is next-morning Singapore)', () => {
    // 20:00 UTC = 04:00 the next day in Singapore (+8).
    expect(instantToLocalString('2026-11-12T20:00:00.000Z')).toBe('2026-11-13T04:00');
    expect(partsToInstant('2026-11-13', '04:00')).toBe('2026-11-12T20:00:00.000Z');
  });

  it('round-trips any instant', () => {
    const iso = '2026-03-01T06:30:00.000Z';
    const { date, time } = isoToLocalParts(iso);
    expect(partsToInstant(date, time)).toBe(iso);
  });

  it('is empty for missing or invalid input', () => {
    expect(partsToInstant('', '09:00')).toBe('');
    expect(localStringToInstant('')).toBe('');
    expect(instantToLocalString(null)).toBe('');
    expect(isoToLocalParts(null)).toEqual({ date: '', time: '' });
  });
});
