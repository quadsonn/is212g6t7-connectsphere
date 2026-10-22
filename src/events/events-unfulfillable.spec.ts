import { EventStatus } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  RejectUnfulfillableDto,
  UnfulfillableReason,
} from './dto/reject-unfulfillable.dto';
import {
  canTransition,
  REVIEW_REJECTION_STATUSES,
  UNFULFILLABLE_REJECTION_STATUSES,
} from './event-status.machine';
import { unfulfillableReasonText } from './events-unfulfillable.service';

const parse = async (body: Record<string, unknown>) => {
  const dto = plainToInstance(RejectUnfulfillableDto, body);
  const errors = await validate(dto);
  return { dto, messages: errors.flatMap((e) => Object.values(e.constraints ?? {})) };
};

/** US-47 — reject an unfulfillable request. Tagged "US-47 AC-n". */
describe('US-47 reject unfulfillable request', () => {
  describe('US-47 AC-2: a reason category and a comment', () => {
    it.each(Object.values(UnfulfillableReason))('accepts %s', async (reason) => {
      const { messages } = await parse({ reason, comment: 'Every hall is booked that week.' });
      expect(messages).toEqual([]);
    });

    it.each([
      [UnfulfillableReason.NO_SUITABLE_VENUE, 'No suitable venue: Halls full.'],
      [UnfulfillableReason.NO_AVAILABLE_EQUIPMENT, 'No available equipment: Halls full.'],
      [
        UnfulfillableReason.NO_VENUE_OR_EQUIPMENT,
        'No suitable venue or available equipment: Halls full.',
      ],
    ])('stores %s as readable text for the Organiser', (reason, text) => {
      expect(unfulfillableReasonText({ reason, comment: 'Halls full.' })).toBe(text);
    });

    it('trims the comment', async () => {
      const { dto } = await parse({ reason: 'NO_SUITABLE_VENUE', comment: '  Full.  ' });
      expect(dto.comment).toBe('Full.');
    });
  });

  describe('US-47 AC-3: cannot be submitted without a reason', () => {
    it.each([[{}], [{ reason: '' }], [{ reason: 'TOO_EXPENSIVE' }]])('refuses %j', async (body) => {
      const { messages } = await parse({ comment: 'x', ...body });
      expect(messages).toContain(
        'a reason is required: one of NO_SUITABLE_VENUE, NO_AVAILABLE_EQUIPMENT, NO_VENUE_OR_EQUIPMENT',
      );
    });

    it.each([[{}], [{ comment: '' }], [{ comment: '   ' }]])(
      'refuses a missing comment too, as US-08 does: %j',
      async (body) => {
        const { messages } = await parse({ reason: 'NO_SUITABLE_VENUE', ...body });
        expect(messages).toContain('a comment is required to reject this request');
      },
    );
  });

  describe('US-47 AC-4: which statuses may be rejected as unfulfillable', () => {
    it('is the arrangement statuses — after review, before confirmation', () => {
      expect(UNFULFILLABLE_REJECTION_STATUSES).toEqual([
        EventStatus.APPROVED,
        EventStatus.PLANNING,
        EventStatus.AWAITING_ARRANGEMENTS,
      ]);
    });

    it('the status machine allows REJECTED from each of them', () => {
      for (const status of UNFULFILLABLE_REJECTION_STATUSES) {
        expect(canTransition(status, EventStatus.REJECTED)).toBe(true);
      }
    });

    it('still forbids it from a confirmed, completed or cancelled event', () => {
      for (const status of [EventStatus.CONFIRMED, EventStatus.COMPLETED, EventStatus.CANCELLED]) {
        expect(canTransition(status, EventStatus.REJECTED)).toBe(false);
      }
    });

    it("keeps US-08's review rejection to the review statuses it always had", () => {
      expect(REVIEW_REJECTION_STATUSES).toEqual([
        EventStatus.SUBMITTED,
        EventStatus.UNDER_REVIEW,
        EventStatus.AWAITING_CLARIFICATION,
      ]);
      for (const status of REVIEW_REJECTION_STATUSES) {
        expect(UNFULFILLABLE_REJECTION_STATUSES).not.toContain(status);
      }
    });
  });
});
