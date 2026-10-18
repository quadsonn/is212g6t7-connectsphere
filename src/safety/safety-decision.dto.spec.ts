import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ResubmitSafetyDto } from './dto/resubmit-safety.dto';
import { SafetyDecisionDto } from './dto/safety-decision.dto';

const errorsFor = async (plain: Record<string, unknown>) => {
  const errors = await validate(plainToInstance(SafetyDecisionDto, plain));
  return errors.map((e) => e.property);
};

/** Requirement change 6 AC-3/AC-4 — the shape of a safety decision. */
describe('SafetyDecisionDto', () => {
  it('accepts an approval with no reason and no comments', async () => {
    expect(await errorsFor({ outcome: 'APPROVED' })).toEqual([]);
  });

  it('accepts comments on the four factors reviewed, on any outcome', async () => {
    expect(
      await errorsFor({
        outcome: 'APPROVED',
        emergencyAccessComment: 'Two clear exits',
        crowdMovementComment: 'Wide aisles',
        equipmentPlacementComment: 'Cables taped down',
        accessibilityComment: 'Ramp at the side door',
      }),
    ).toEqual([]);
  });

  it('flags an unknown or missing outcome', async () => {
    expect(await errorsFor({})).toContain('outcome');
    expect(await errorsFor({ outcome: 'MAYBE' })).toContain('outcome');
  });

  describe('reject', () => {
    it('requires a reason', async () => {
      expect(await errorsFor({ outcome: 'REJECTED' })).toContain('reason');
    });

    it('rejects a blank reason', async () => {
      expect(await errorsFor({ outcome: 'REJECTED', reason: '   ' })).toContain('reason');
    });

    it('accepts a reason, and needs no return stage', async () => {
      expect(await errorsFor({ outcome: 'REJECTED', reason: 'Blocked fire exit' })).toEqual([]);
    });
  });

  describe('request changes', () => {
    it('requires a reason', async () => {
      expect(
        await errorsFor({ outcome: 'CHANGES_REQUESTED', returnStage: 'VENUE' }),
      ).toContain('reason');
    });

    it('requires the planning stage to return to', async () => {
      expect(
        await errorsFor({ outcome: 'CHANGES_REQUESTED', reason: 'Too crowded' }),
      ).toContain('returnStage');
    });

    it.each(['VENUE', 'TECHNICAL'])('accepts returning to %s planning', async (returnStage) => {
      expect(
        await errorsFor({ outcome: 'CHANGES_REQUESTED', reason: 'Too crowded', returnStage }),
      ).toEqual([]);
    });

    it('refuses any other stage', async () => {
      expect(
        await errorsFor({ outcome: 'CHANGES_REQUESTED', reason: 'Too crowded', returnStage: 'SUBMITTED' }),
      ).toContain('returnStage');
    });
  });

  it('flags over-long text', async () => {
    expect(
      await errorsFor({ outcome: 'APPROVED', crowdMovementComment: 'x'.repeat(1001) }),
    ).toContain('crowdMovementComment');
  });
});

/** The Coordinator's optional comment when sending an event back for a check. */
describe('ResubmitSafetyDto', () => {
  const errorsForResubmit = async (plain: Record<string, unknown>) =>
    (await validate(plainToInstance(ResubmitSafetyDto, plain))).map((e) => e.property);

  it('accepts no comment at all', async () => {
    expect(await errorsForResubmit({})).toEqual([]);
  });

  it('accepts a comment', async () => {
    expect(await errorsForResubmit({ comment: 'Added a second exit at the rear.' })).toEqual([]);
  });

  it('trims the comment', () => {
    expect(plainToInstance(ResubmitSafetyDto, { comment: '  Added an exit.  ' }).comment).toBe(
      'Added an exit.',
    );
  });

  it('flags a comment that is too long', async () => {
    expect(await errorsForResubmit({ comment: 'x'.repeat(1001) })).toContain('comment');
  });

  it('flags a comment that is not text', async () => {
    expect(await errorsForResubmit({ comment: 42 })).toContain('comment');
  });
});
