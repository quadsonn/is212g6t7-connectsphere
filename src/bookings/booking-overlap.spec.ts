import { BookingStatus } from '@prisma/client';

import { isLive, paddedRange } from './booking-overlap';

/** US-49 — the padded window a booking occupies once venue buffers apply. */
describe('paddedRange (US-49)', () => {
  const at = (time: string) => new Date(`2030-10-01T${time}:00Z`);

  it('US-49: the customer example — 10:00-12:00 with 30/45 min occupies 09:30-12:45', () => {
    expect(paddedRange(at('10:00'), at('12:00'), 30, 45)).toEqual({
      start: at('09:30'),
      end: at('12:45'),
    });
  });

  it('US-49: zero buffers return the input range unchanged', () => {
    expect(paddedRange(at('10:00'), at('12:00'), 0, 0)).toEqual({
      start: at('10:00'),
      end: at('12:00'),
    });
  });

  it('US-49: does not mutate the dates it is given', () => {
    const start = at('10:00');
    const end = at('12:00');

    const padded = paddedRange(start, end, 30, 45);

    expect(start).toEqual(at('10:00'));
    expect(end).toEqual(at('12:00'));
    expect(padded.start).not.toBe(start);
    expect(padded.end).not.toBe(end);
  });
});

describe('isLive (US-54)', () => {
  // TC-S3-157 · US-54 AC-6 · setup: none (unit) · fails if a booking's liveness is not judged against the current time by default
  // Code: isLive (default now)
  it('judges a hold against the current time when no time is given', () => {
    const hour = 3_600_000;
    expect(isLive({ status: BookingStatus.HELD, holdExpiresAt: new Date(Date.now() + hour) })).toBe(true);
    expect(isLive({ status: BookingStatus.HELD, holdExpiresAt: new Date(Date.now() - hour) })).toBe(false);
  });
});
