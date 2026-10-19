import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateVenueBuffersDto } from './dto/venue-buffers.dto';

/** US-49 AC-3 — only whole numbers 0-480 are accepted. */
describe('UpdateVenueBuffersDto (US-49)', () => {
  const errorsFor = async (body: Record<string, unknown>) => {
    const dto = plainToInstance(UpdateVenueBuffersDto, body);
    const errors = await validate(dto, { whitelist: true });
    return errors.map((error) => error.property);
  };

  it.each([0, 30, 480])('US-49: accepts %p minutes', async (minutes) => {
    expect(
      await errorsFor({ setupMinutes: minutes, turnaroundMinutes: minutes }),
    ).toEqual([]);
  });

  it.each([
    ['-1', -1],
    ['481', 481],
    ['1.5', 1.5],
    ['"abc"', 'abc'],
    ['"30" (a string, not a number)', '30'],
    ['null', null],
  ])('US-49: rejects %s', async (_label, value) => {
    expect(
      await errorsFor({ setupMinutes: value, turnaroundMinutes: value }),
    ).toEqual(['setupMinutes', 'turnaroundMinutes']);
  });

  it('US-49: rejects missing values', async () => {
    expect(await errorsFor({})).toEqual(['setupMinutes', 'turnaroundMinutes']);
    expect(await errorsFor({ setupMinutes: 30 })).toEqual(['turnaroundMinutes']);
  });
});
