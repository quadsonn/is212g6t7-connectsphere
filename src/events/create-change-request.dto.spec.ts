import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

import { CreateChangeRequestDto } from './dto/create-change-request.dto';

/** US-36 — boundary validation of the change request payload. */
describe('CreateChangeRequestDto (US-36)', () => {
  const collect = (list: ValidationError[]): string[] =>
    list.flatMap((error) => [
      ...Object.values(error.constraints ?? {}),
      ...collect(error.children ?? []),
    ]);

  const messages = async (payload: Record<string, unknown>) =>
    collect(await validate(plainToInstance(CreateChangeRequestDto, payload)));

  const valid = { reason: 'Venue is no longer free', proposedAttendance: 80 };

  it('accepts a minimal valid payload', async () => {
    expect(await messages(valid)).toEqual([]);
  });

  describe('AC: a reason is required', () => {
    it('rejects a missing reason', async () => {
      expect(await messages({ proposedAttendance: 80 })).toContain('reason is required');
    });

    it('rejects a blank reason', async () => {
      expect(await messages({ ...valid, reason: '   ' })).toContain('reason is required');
    });
  });

  describe('AC: expected attendance is a positive whole number', () => {
    it.each([0, -5])('rejects %s', async (value) => {
      expect(await messages({ ...valid, proposedAttendance: value })).toContain(
        'proposedAttendance must be greater than zero',
      );
    });

    it('rejects a fraction', async () => {
      expect(await messages({ ...valid, proposedAttendance: 2.5 })).toContain(
        'proposedAttendance must be a whole number',
      );
    });
  });

  describe('AC: end time must be after start time', () => {
    it('rejects an end before the start', async () => {
      expect(
        await messages({
          reason: 'r',
          proposedStart: '2026-12-01T17:00:00Z',
          proposedEnd: '2026-12-01T09:00:00Z',
        }),
      ).toContain('proposedEnd must be later than proposedStart');
    });

    it('rejects a malformed date', async () => {
      expect(await messages({ reason: 'r', proposedStart: 'not-a-date' })).toContain(
        'proposedStart must be a valid ISO 8601 date',
      );
    });
  });

  describe('AC: equipment quantities are positive whole numbers', () => {
    const lineMessages = (quantity: unknown) =>
      messages({ reason: 'r', equipment: [{ equipmentId: 'projector', quantity }] });

    it('accepts a positive whole number', async () => {
      expect(await lineMessages(3)).toEqual([]);
    });

    it.each([0, -1])('rejects %s', async (quantity) => {
      expect(await lineMessages(quantity)).toContain('quantity must be greater than zero');
    });

    it('rejects a fraction', async () => {
      expect(await lineMessages(1.5)).toContain('quantity must be a whole number');
    });

    it('rejects a line with no catalogue id', async () => {
      expect(await messages({ reason: 'r', equipment: [{ quantity: 1 }] })).toContain(
        'equipmentId is required',
      );
    });

    it('accepts an empty list (remove everything)', async () => {
      expect(await messages({ reason: 'r', equipment: [] })).toEqual([]);
    });
  });
});
