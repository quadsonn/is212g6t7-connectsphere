import { ConfirmedArrangement } from '@prisma/client';

import { affectedArrangements, diffEventFields } from './event-change.rules';

/** US-24 AC-2 / US-25 AC-2 — what counts as a change, and which need review. */
describe('event change rules (US-24, US-25)', () => {
  describe('diffEventFields', () => {
    const before = {
      name: 'Orientation',
      expectedAttendance: 320,
      proposedStart: new Date('2030-10-01T09:00:00Z'),
      accessibilityRequirements: ['HEARING_LOOP', 'STEP_FREE_ACCESS'],
      programme: null,
    };

    it('reports previous and new values for a changed field', () => {
      expect(diffEventFields(before, { expectedAttendance: 400 })).toEqual([
        { field: 'expectedAttendance', previous: 320, next: 400 },
      ]);
    });

    it('ignores fields that were not sent', () => {
      expect(diffEventFields(before, {})).toEqual([]);
    });

    it('ignores a field re-sent with the same value', () => {
      expect(
        diffEventFields(before, {
          name: 'Orientation',
          proposedStart: new Date('2030-10-01T09:00:00Z'),
        }),
      ).toEqual([]);
    });

    it('treats a reordered array as unchanged', () => {
      expect(
        diffEventFields(before, {
          accessibilityRequirements: ['STEP_FREE_ACCESS', 'HEARING_LOOP'],
        }),
      ).toEqual([]);
    });

    it('stores dates as ISO strings so the history is JSON', () => {
      expect(
        diffEventFields(before, { proposedStart: new Date('2030-10-02T09:00:00Z') }),
      ).toEqual([
        {
          field: 'proposedStart',
          previous: '2030-10-01T09:00:00.000Z',
          next: '2030-10-02T09:00:00.000Z',
        },
      ]);
    });

    it('records setting a previously empty field', () => {
      expect(diffEventFields(before, { programme: '09:00 Welcome' })).toEqual([
        { field: 'programme', previous: null, next: '09:00 Welcome' },
      ]);
    });

    it('US-19 AC-3: records a change to the required facilities', () => {
      expect(
        diffEventFields({ requiredFacilities: ['PROJECTOR'] }, { requiredFacilities: ['PROJECTOR', 'STAGE'] }),
      ).toEqual([{ field: 'requiredFacilities', previous: ['PROJECTOR'], next: ['PROJECTOR', 'STAGE'] }]);
    });

    it('never reports a field outside the tracked set', () => {
      expect(
        diffEventFields(before, { status: 'CANCELLED' } as Record<string, unknown>),
      ).toEqual([]);
    });
  });

  describe('affectedArrangements', () => {
    const change = (field: string) =>
      diffEventFields({}, { [field]: field === 'expectedAttendance' ? 1 : 'x' });

    it('flags a venue booking when attendance changes', () => {
      expect(
        affectedArrangements(change('expectedAttendance'), [
          ConfirmedArrangement.VENUE_BOOKING,
        ]),
      ).toEqual([ConfirmedArrangement.VENUE_BOOKING]);
    });

    it('US-19 AC-3: flags a venue booking when the required facilities change', () => {
      expect(
        affectedArrangements(diffEventFields({}, { requiredFacilities: ['STAGE'] }), [
          ConfirmedArrangement.VENUE_BOOKING,
          ConfirmedArrangement.EQUIPMENT_RESERVATION,
        ]),
      ).toEqual([ConfirmedArrangement.VENUE_BOOKING]);
    });

    it('flags an equipment reservation when equipment needs change', () => {
      expect(
        affectedArrangements(change('equipmentNeeds'), [
          ConfirmedArrangement.VENUE_BOOKING,
          ConfirmedArrangement.EQUIPMENT_RESERVATION,
        ]),
      ).toEqual([ConfirmedArrangement.EQUIPMENT_RESERVATION]);
    });

    it('flags both when the dates move', () => {
      expect(
        affectedArrangements(
          diffEventFields({}, { proposedStart: new Date('2031-01-01T00:00:00Z') }),
          [ConfirmedArrangement.VENUE_BOOKING, ConfirmedArrangement.EQUIPMENT_RESERVATION],
        ),
      ).toEqual([
        ConfirmedArrangement.VENUE_BOOKING,
        ConfirmedArrangement.EQUIPMENT_RESERVATION,
      ]);
    });

    it('does not flag a sensitive field when nothing is confirmed yet', () => {
      expect(affectedArrangements(change('expectedAttendance'), [])).toEqual([]);
    });

    it('does not flag an ordinary edit such as the programme', () => {
      expect(
        affectedArrangements(change('programme'), [
          ConfirmedArrangement.VENUE_BOOKING,
          ConfirmedArrangement.EQUIPMENT_RESERVATION,
        ]),
      ).toEqual([]);
    });
  });
});
