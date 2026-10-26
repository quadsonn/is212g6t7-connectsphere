import { ValidationPipe } from '@nestjs/common';
import { AccessibilityFeature } from '@prisma/client';
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

/** US-33 AC-2 and US-35 AC-2 — the boundary validation. */
describe('registration DTOs', () => {
  // TC-S2-138 · US-33 AC-2 · unit: RegisterDto · fails if a missing or invalid field gets past validation
  describe('RegisterDto (US-33 AC-2)', () => {
    const valid = { eventId: 'event-1', phone: '+65 9123 4567' };

    it('accepts the required fields alone', async () => {
      expect(await errorsFor(RegisterDto, valid)).toEqual([]);
    });

    it('accepts the optional accessibility fields', async () => {
      expect(
        await errorsFor(RegisterDto, {
          ...valid,
          accessibilityFeature: AccessibilityFeature.HEARING_LOOP,
          accessibilityNeeds: 'Seat near the front, please',
        }),
      ).toEqual([]);
    });

    it('accepts a request of the Attendee’s own with no standard option', async () => {
      expect(
        await errorsFor(RegisterDto, {
          ...valid,
          accessibilityNeeds: 'Sign-language interpreter',
        }),
      ).toEqual([]);
    });

    it('flags an accessibility option that is not on the list', async () => {
      expect(
        await errorsFor(RegisterDto, { ...valid, accessibilityFeature: 'OTHER' }),
      ).toContain('accessibilityFeature');
    });

    it('no longer collects dietary requirements: the app’s pipe drops the field', async () => {
      const pipe = new ValidationPipe({ whitelist: true, transform: true });

      const result = await pipe.transform(
        { ...valid, dietaryRequirements: 'Vegetarian' },
        { type: 'body', metatype: RegisterDto },
      );

      expect(result).not.toHaveProperty('dietaryRequirements');
      expect(result.phone).toBe('+6591234567');
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

    it.each([
      ['+65 9123 4567', '+6591234567'],
      ['+6591234567', '+6591234567'],
      ['+44 20 7946 0958', '+442079460958'],
      ['+1 (415) 555-2671', '+14155552671'],
      ['+91 98765 43210', '+919876543210'],
      ['+49 30 901820', '+4930901820'],
      ['+852 5123 4567', '+85251234567'],
      ['+358 40 1234567', '+358401234567'],
    ])('accepts the international number %p and stores it as %p', async (phone, e164) => {
      const dto = plainToInstance(RegisterDto, { ...valid, phone });

      expect(await errorsFor(RegisterDto, { ...valid, phone })).toEqual([]);
      expect(dto.phone).toBe(e164);
    });

    it.each([
      '91234567',
      '0044 20 7946 0958',
      '1-------------2',
      '+1234567890123456789',
      '+12 3',
      '+65 9123 4567x',
      '+65 9123 4567 ext 12',
      '+65 CALL-NOW',
    ])(
      'flags the number %p: no country code, or not a real number',
      async (phone) => {
        expect(await errorsFor(RegisterDto, { ...valid, phone })).toContain('phone');
      },
    );

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
          accessibilityNeeds: 'x'.repeat(501),
        }),
      ).toContain('accessibilityNeeds');
    });
  });

  // TC-S2-152 · US-35 AC-2 · unit: WithdrawDto · fails if a withdrawal without confirm: true gets past validation
  describe('WithdrawDto (US-35 AC-2)', () => {
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
