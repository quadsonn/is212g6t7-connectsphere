import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CancelEventDto } from './dto/cancel-event.dto';

/** US-43 AC-2 — a reason is required and the Organiser must confirm. */
describe('CancelEventDto (US-43)', () => {
  const messages = async (payload: Record<string, unknown>) => {
    const errors = await validate(plainToInstance(CancelEventDto, payload));
    return errors.flatMap((error) => Object.values(error.constraints ?? {}));
  };

  it('accepts a reason that has been confirmed', async () => {
    expect(await messages({ reason: 'Speaker withdrew', confirm: true })).toEqual([]);
  });

  it('rejects a missing reason', async () => {
    expect(await messages({ confirm: true })).toContain(
      'a reason is required to cancel this event',
    );
  });

  it('rejects a blank reason', async () => {
    expect(await messages({ reason: '   ', confirm: true })).toContain(
      'a reason is required to cancel this event',
    );
  });

  it('rejects a cancellation that has not been confirmed', async () => {
    expect(await messages({ reason: 'Speaker withdrew' })).toContain(
      'the cancellation must be confirmed',
    );
    expect(await messages({ reason: 'Speaker withdrew', confirm: false })).toContain(
      'the cancellation must be confirmed',
    );
  });

  it('does not treat the string "true" as a confirmation', async () => {
    expect(await messages({ reason: 'Speaker withdrew', confirm: 'true' })).toContain(
      'the cancellation must be confirmed',
    );
  });

  it('trims the reason before it is stored', () => {
    const dto = plainToInstance(CancelEventDto, { reason: '  Venue flooded  ', confirm: true });

    expect(dto.reason).toBe('Venue flooded');
  });
});
