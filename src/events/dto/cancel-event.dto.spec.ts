import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CancelEventDto } from './cancel-event.dto';

/**
 * US-43 AC-2 — the cancel request's shape. Blank reasons and a missing
 * confirmation are refused end to end in test/us43-cancel-event.e2e-spec.ts.
 */
describe('US-43 CancelEventDto', () => {
  const errorsFor = async (plain: Record<string, unknown>) =>
    (await validate(plainToInstance(CancelEventDto, plain))).map((e) => e.property);

  // TC-S3-76 · US-43 AC-2 · setup: none (unit) · fails if a reason that is not text gets past the trim and is accepted
  // Code: CancelEventDto reason (trim leaves non-strings alone) + @IsString
  it('refuses a reason that is not text, and accepts a trimmed one', async () => {
    expect(await errorsFor({ reason: 42, confirm: true })).toContain('reason');
    expect(plainToInstance(CancelEventDto, { reason: '  Speaker withdrew  ', confirm: true }).reason).toBe(
      'Speaker withdrew',
    );
  });
});
