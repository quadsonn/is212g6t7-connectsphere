import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RegisterDto } from './dto/register.dto';
import { WithdrawDto } from './dto/withdraw.dto';

const errorsFor = async <T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
) => {
  const errors = await validate(plainToInstance(cls, plain));
  return errors.map((e) => e.property);
};

/** US-34 AC-2 and US-36 AC-2 — the boundary validation. */
describe('registration DTOs', () => {
  describe('RegisterDto (US-34 AC-2)', () => {
    const valid = { eventId: 'event-1', phone: '+65 9123 4567' };

    it('accepts the required fields alone', async () => {
      expect(await errorsFor(RegisterDto, valid)).toEqual([]);
    });

    it('accepts the optional fields', async () => {
      expect(
        await errorsFor(RegisterDto, {
          ...valid,
          dietaryRequirements: 'Vegetarian',
          accessibilityNeeds: 'Wheelchair access',
        }),
      ).toEqual([]);
    });

    it('flags a missing phone number', async () => {
      expect(await errorsFor(RegisterDto, { eventId: 'event-1' })).toContain(
        'phone',
      );
    });

    it('flags a blank phone number', async () => {
      expect(
        await errorsFor(RegisterDto, { ...valid, phone: '   ' }),
      ).toContain('phone');
    });

    it.each(['abc', '12', 'call me maybe', '+++'])(
      'flags the invalid phone number %p',
      async (phone) => {
        expect(await errorsFor(RegisterDto, { ...valid, phone })).toContain(
          'phone',
        );
      },
    );

    it('flags a missing event id', async () => {
      expect(await errorsFor(RegisterDto, { phone: valid.phone })).toContain(
        'eventId',
      );
    });

    it('flags over-long optional text', async () => {
      expect(
        await errorsFor(RegisterDto, {
          ...valid,
          dietaryRequirements: 'x'.repeat(501),
        }),
      ).toContain('dietaryRequirements');
    });
  });

  describe('WithdrawDto (US-36 AC-2)', () => {
    it('accepts an explicit confirmation', async () => {
      expect(await errorsFor(WithdrawDto, { confirm: true })).toEqual([]);
    });

    it.each([{}, { confirm: false }, { confirm: 'true' }])(
      'refuses %p',
      async (body) => {
        expect(await errorsFor(WithdrawDto, body)).toContain('confirm');
      },
    );
  });
});
