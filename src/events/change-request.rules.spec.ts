import { EventStatus } from '@prisma/client';

import {
  CHANGEABLE_STATUSES,
  CurrentEventValues,
  evaluateChangeRequest,
  isChangeable,
  NO_DIFFERENCE_MESSAGE,
  sameEquipment,
} from './change-request.rules';

/** US-37 — what makes a change request valid, and what it actually changes. */
describe('change request rules (US-37)', () => {
  const now = new Date('2026-10-05T09:00:00Z');
  const start = new Date('2026-11-01T09:00:00Z');
  const end = new Date('2026-11-01T17:00:00Z');

  const current: CurrentEventValues = {
    proposedStart: start,
    proposedEnd: end,
    expectedAttendance: 50,
    equipment: [
      { equipmentId: 'projector', quantity: 2 },
      { equipmentId: 'mic', quantity: 4 },
    ],
  };

  describe('AC: only submitted or confirmed (and live in between) events', () => {
    it.each([
      EventStatus.SUBMITTED,
      EventStatus.UNDER_REVIEW,
      EventStatus.APPROVED,
      EventStatus.RETURNED,
      EventStatus.AWAITING_CLARIFICATION,
      EventStatus.PLANNING,
      EventStatus.AWAITING_ARRANGEMENTS,
      EventStatus.CONFIRMED,
    ])('allows %s', (status) => {
      expect(isChangeable(status)).toBe(true);
    });

    it.each([
      EventStatus.DRAFT,
      EventStatus.REJECTED,
      EventStatus.CANCELLED,
      EventStatus.COMPLETED,
    ])('refuses %s', (status) => {
      expect(isChangeable(status)).toBe(false);
    });

    it('covers every status explicitly, so a new one has to be decided', () => {
      const decided = [
        ...CHANGEABLE_STATUSES,
        EventStatus.DRAFT,
        EventStatus.REJECTED,
        EventStatus.CANCELLED,
        EventStatus.COMPLETED,
      ];
      expect([...decided].sort()).toEqual(Object.values(EventStatus).sort());
    });
  });

  describe('AC: at least one field must differ from the current value', () => {
    it('rejects a request that restates every current value', () => {
      const result = evaluateChangeRequest(
        current,
        {
          proposedStart: new Date(start),
          proposedEnd: new Date(end),
          proposedAttendance: 50,
          equipment: [
            { equipmentId: 'mic', quantity: 4 },
            { equipmentId: 'projector', quantity: 2 },
          ],
        },
        now,
      );

      expect(result.errors).toEqual([NO_DIFFERENCE_MESSAGE]);
      expect(result.changed).toEqual([]);
    });

    it('rejects a request that proposes nothing at all', () => {
      expect(evaluateChangeRequest(current, {}, now).errors).toEqual([
        NO_DIFFERENCE_MESSAGE,
      ]);
    });

    it('accepts a change to attendance alone and reports only that field', () => {
      const result = evaluateChangeRequest(current, { proposedAttendance: 80 }, now);

      expect(result.errors).toEqual([]);
      expect(result.changed).toEqual(['proposedAttendance']);
    });

    it('reports only the fields that differ when others are restated', () => {
      const result = evaluateChangeRequest(
        current,
        { proposedStart: new Date(start), proposedEnd: new Date('2026-11-01T18:00:00Z') },
        now,
      );

      expect(result.errors).toEqual([]);
      expect(result.changed).toEqual(['proposedEnd']);
    });
  });

  describe('AC: dates cannot be in the past; end must be after start', () => {
    it('rejects a start in the past', () => {
      const result = evaluateChangeRequest(
        current,
        { proposedStart: new Date('2026-10-01T09:00:00Z') },
        now,
      );
      expect(result.errors).toContain('proposedStart must be in the future');
    });

    it('rejects an end in the past', () => {
      const result = evaluateChangeRequest(
        current,
        { proposedEnd: new Date('2026-10-01T09:00:00Z') },
        now,
      );
      expect(result.errors).toContain('proposedEnd must be in the future');
    });

    it('rejects an end that is not after the start', () => {
      const result = evaluateChangeRequest(
        current,
        { proposedStart: end, proposedEnd: end },
        now,
      );
      expect(result.errors).toContain('proposedEnd must be later than proposedStart');
    });

    it('judges a lone new start against the existing end', () => {
      const result = evaluateChangeRequest(
        current,
        { proposedStart: new Date('2026-11-02T09:00:00Z') },
        now,
      );
      expect(result.errors).toContain('proposedEnd must be later than proposedStart');
    });

    it('judges a lone new end against the existing start', () => {
      const result = evaluateChangeRequest(
        current,
        { proposedEnd: new Date('2026-11-01T08:00:00Z') },
        now,
      );
      expect(result.errors).toContain('proposedEnd must be later than proposedStart');
    });

    it('accepts a later date with the end after the start', () => {
      const result = evaluateChangeRequest(
        current,
        {
          proposedStart: new Date('2026-12-01T09:00:00Z'),
          proposedEnd: new Date('2026-12-01T17:00:00Z'),
        },
        now,
      );
      expect(result.errors).toEqual([]);
      expect(result.changed).toEqual(['proposedStart', 'proposedEnd']);
    });

    it('does not check dates the request leaves alone', () => {
      const pastEvent = { ...current, proposedStart: new Date('2026-01-01T09:00:00Z') };
      const result = evaluateChangeRequest(pastEvent, { proposedAttendance: 60 }, now);
      expect(result.errors).toEqual([]);
    });
  });

  describe('AC: equipment changes — add, remove, change quantity', () => {
    it('detects an added item', () => {
      const result = evaluateChangeRequest(
        current,
        { equipment: [...current.equipment, { equipmentId: 'camera', quantity: 1 }] },
        now,
      );
      expect(result.errors).toEqual([]);
      expect(result.changed).toEqual(['equipment']);
    });

    it('detects a removed item', () => {
      const result = evaluateChangeRequest(
        current,
        { equipment: [{ equipmentId: 'projector', quantity: 2 }] },
        now,
      );
      expect(result.changed).toEqual(['equipment']);
    });

    it('detects a changed quantity', () => {
      const result = evaluateChangeRequest(
        current,
        {
          equipment: [
            { equipmentId: 'projector', quantity: 3 },
            { equipmentId: 'mic', quantity: 4 },
          ],
        },
        now,
      );
      expect(result.changed).toEqual(['equipment']);
    });

    it('treats an empty list as removing everything', () => {
      const result = evaluateChangeRequest(current, { equipment: [] }, now);
      expect(result.errors).toEqual([]);
      expect(result.changed).toEqual(['equipment']);
    });

    it('treats an empty list as no change when the event has no equipment', () => {
      const result = evaluateChangeRequest({ ...current, equipment: [] }, { equipment: [] }, now);
      expect(result.errors).toEqual([NO_DIFFERENCE_MESSAGE]);
    });

    it('rejects the same catalogue item listed twice', () => {
      const result = evaluateChangeRequest(
        current,
        {
          equipment: [
            { equipmentId: 'camera', quantity: 1 },
            { equipmentId: 'camera', quantity: 2 },
          ],
        },
        now,
      );
      expect(result.errors).toEqual([
        expect.stringContaining('camera is listed more than once'),
      ]);
    });

    it('compares lists regardless of order', () => {
      expect(
        sameEquipment(
          [
            { equipmentId: 'a', quantity: 1 },
            { equipmentId: 'b', quantity: 2 },
          ],
          [
            { equipmentId: 'b', quantity: 2 },
            { equipmentId: 'a', quantity: 1 },
          ],
        ),
      ).toBe(true);
    });
  });
});
