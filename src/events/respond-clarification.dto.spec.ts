import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { ValidationError, validate } from 'class-validator';

import { RespondClarificationDto } from './dto/respond-clarification.dto';

/** US-58 — the Organiser's response, and the request details it may update. */
describe('RespondClarificationDto (US-58)', () => {
  /** Every message, including those on the nested `changes`. */
  const flatten = (errors: ValidationError[]): string[] =>
    errors.flatMap((error) => [
      ...Object.values(error.constraints ?? {}),
      ...flatten(error.children ?? []),
    ]);

  const messages = async (payload: Record<string, unknown>) =>
    flatten(await validate(plainToInstance(RespondClarificationDto, payload)));

  describe('AC6: an empty response cannot be submitted', () => {
    it('Given a whitespace-only response, Then it is refused as empty', async () => {
      expect(await messages({ response: '   \n  ' })).toContain('a response is required');
    });

    it('Given a response with surrounding spaces, Then it is stored trimmed', () => {
      const dto = plainToInstance(RespondClarificationDto, { response: '  We expect 320.  ' });

      expect(dto.response).toBe('We expect 320.');
    });
  });

  describe('AC3: details may be updated with the response, under the existing edit rules', () => {
    it('Given a response with no changes, Then it is valid', async () => {
      expect(await messages({ response: 'We expect 320.' })).toEqual([]);
    });

    it('Given valid changes, Then they are accepted and converted like an edit', async () => {
      const dto = plainToInstance(RespondClarificationDto, {
        response: 'Moved it a day later.',
        changes: { proposedStart: '2030-10-02T09:00:00Z', expectedAttendance: '400' },
      });

      expect(await validate(dto)).toEqual([]);
      expect(dto.changes?.proposedStart).toEqual(new Date('2030-10-02T09:00:00Z'));
      expect(dto.changes?.expectedAttendance).toBe(400);
    });

    it('Given an end before its start, Then the same message as an edit is returned', async () => {
      expect(
        await messages({
          response: 'New times.',
          changes: { proposedStart: '2030-10-02T17:00:00Z', proposedEnd: '2030-10-02T09:00:00Z' },
        }),
      ).toContain('proposedEnd must be later than proposedStart');
    });

    it('Given a layout outside the list, Then it is refused', async () => {
      expect(
        await messages({ response: 'Different layout.', changes: { preferredLayout: 'CIRCUS' } }),
      ).not.toEqual([]);
    });
  });
});
