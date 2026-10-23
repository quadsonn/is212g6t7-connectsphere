import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RejectChangeRequestDto } from './dto/reject-change-request.dto';

/** US-37 AC-3 — rejecting a change request requires a reason. */
describe('RejectChangeRequestDto (US-37)', () => {
  const messages = async (payload: Record<string, unknown>) => {
    const errors = await validate(plainToInstance(RejectChangeRequestDto, payload));
    return errors.flatMap((error) => Object.values(error.constraints ?? {}));
  };

  it('accepts a reason', async () => {
    expect(await messages({ reason: 'The venue is booked solid' })).toEqual([]);
  });

  it('rejects a missing reason', async () => {
    expect(await messages({})).toContain('reason is required');
  });

  it('rejects a blank reason', async () => {
    expect(await messages({ reason: '   ' })).toContain('reason is required');
  });

  it('trims the reason before it is stored', () => {
    const dto = plainToInstance(RejectChangeRequestDto, { reason: '  Too late  ' });
    expect(dto.reason).toBe('Too late');
  });
});
