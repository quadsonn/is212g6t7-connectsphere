import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateEventRequestDto } from './dto/create-event-request.dto';

/**
 * TC-S1-27 — US-03 AC-3 boundaries, on the submission DTO itself.
 *
 * The clock is frozen (Date only) so "just in the past" and "just in the
 * future" are exact to the millisecond. Expected values come from the AC:
 * a past date, an end not after the start, a non-positive attendance and an
 * empty required field are blocked, each flagged on its own field.
 */
// TC-S1-27 · US-03 AC-3 · unit: CreateEventRequestDto run through class-validator, clock frozen ·
// fails if a value just inside or just outside a limit is judged wrongly
describe('CreateEventRequestDto boundaries (TC-S1-27, US-03 AC-3)', () => {
  const NOW = new Date('2030-06-01T12:00:00.000Z');
  const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();
  const HOUR = 3_600_000;

  /** A request that passes every rule; each test changes one value. */
  const valid = () => ({
    name: 'Freshman Orientation 2030',
    purpose: 'Welcome new students',
    description: 'Full-day programme',
    category: 'Student engagement',
    proposedStart: iso(24 * HOUR),
    proposedEnd: iso(32 * HOUR),
    expectedAttendance: 300,
  });

  /** Field → messages, as the API would flag them. */
  const flags = async (overrides: Record<string, unknown>) => {
    const errors = await validate(plainToInstance(CreateEventRequestDto, { ...valid(), ...overrides }));
    return Object.fromEntries(errors.map((e) => [e.property, Object.values(e.constraints ?? {})]));
  };

  beforeEach(() => {
    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'setTimeout', 'setInterval'],
    });
  });

  afterEach(() => jest.useRealTimers());

  it('accepts the baseline request, so each case below isolates one boundary', async () => {
    expect(await flags({})).toEqual({});
  });

  describe('proposed start (a past date is blocked)', () => {
    // TC-S1-27 · fails if a start one millisecond in the past is accepted
    it('blocks a start one millisecond in the past', async () => {
      expect(await flags({ proposedStart: iso(-1), proposedEnd: iso(HOUR) })).toEqual({
        proposedStart: ['proposedStart must be in the future'],
      });
    });

    // TC-S1-27 · fails if a start at the current instant is wrongly treated as past
    it('accepts a start at the current instant (not in the past)', async () => {
      expect(await flags({ proposedStart: iso(0), proposedEnd: iso(HOUR) })).toEqual({});
    });

    // TC-S1-27 · fails if a start one millisecond in the future is refused
    it('accepts a start one millisecond in the future', async () => {
      expect(await flags({ proposedStart: iso(1), proposedEnd: iso(HOUR) })).toEqual({});
    });
  });

  describe('proposed end (must be later than the start)', () => {
    // TC-S1-27 · fails if an end equal to the start is accepted
    it('blocks an end equal to the start, flagging proposedEnd', async () => {
      expect(await flags({ proposedEnd: valid().proposedStart })).toEqual({
        proposedEnd: ['proposedEnd must be later than proposedStart'],
      });
    });

    // TC-S1-27 · fails if an end one millisecond before the start is accepted
    it('blocks an end one millisecond before the start', async () => {
      expect(await flags({ proposedEnd: iso(24 * HOUR - 1) })).toEqual({
        proposedEnd: ['proposedEnd must be later than proposedStart'],
      });
    });

    // TC-S1-27 · fails if an end one millisecond after the start is refused
    it('accepts an end one millisecond after the start', async () => {
      expect(await flags({ proposedEnd: iso(24 * HOUR + 1) })).toEqual({});
    });
  });

  describe('expected attendance (a positive whole number)', () => {
    // TC-S1-27 · fails if an attendance of 0 is accepted
    it('blocks 0', async () => {
      expect(await flags({ expectedAttendance: 0 })).toEqual({
        expectedAttendance: ['expectedAttendance must be greater than zero'],
      });
    });

    // TC-S1-27 · fails if the smallest valid attendance, 1, is refused
    it('accepts 1', async () => {
      expect(await flags({ expectedAttendance: 1 })).toEqual({});
    });

    // TC-S1-27 · fails if a negative attendance is accepted
    it('blocks −1', async () => {
      expect(await flags({ expectedAttendance: -1 })).toEqual({
        expectedAttendance: ['expectedAttendance must be greater than zero'],
      });
    });
  });

  describe('required text (whitespace is not content)', () => {
    // TC-S1-27 · fails if whitespace-only required text is accepted (regression for audit gap #1)
    it.each([
      ['name', 'name is required'],
      ['purpose', 'purpose is required'],
      ['description', 'description is required'],
      ['category', 'category is required'],
    ])('blocks a whitespace-only %s, flagging that field', async (field, message) => {
      expect(await flags({ [field]: '   ' })).toEqual({ [field]: [message] });
    });

    // TC-S1-27 · fails if surrounding whitespace is stored instead of trimmed
    it('accepts padded text and stores it trimmed', async () => {
      const dto = plainToInstance(CreateEventRequestDto, { ...valid(), name: '  Gala  ' });
      expect(await validate(dto)).toEqual([]);
      expect(dto.name).toBe('Gala');
    });
  });
});
