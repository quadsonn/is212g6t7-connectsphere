import { paddedRange } from './booking-overlap';

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
