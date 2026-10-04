import { AccessibilityFeature, RoomLayout } from '@prisma/client';

import {
  CheckStatus,
  OverallSuitability,
  SuitabilityEvent,
  SuitabilityVenue,
  assessSuitability,
} from './suitability';

/** US-20 — the suitability rules, one venue against one event. */
describe('US-20 venue suitability', () => {
  const venue = (overrides: Partial<SuitabilityVenue> = {}): SuitabilityVenue => ({
    capacity: 100,
    accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS, AccessibilityFeature.HEARING_LOOP],
    supportedLayouts: [RoomLayout.THEATRE, RoomLayout.CLASSROOM],
    ...overrides,
  });

  const event = (overrides: Partial<SuitabilityEvent> = {}): SuitabilityEvent => ({
    expectedAttendance: 80,
    accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
    preferredLayout: RoomLayout.THEATRE,
    ...overrides,
  });

  describe('AC-1: capacity', () => {
    it('US-20: passes when attendance equals capacity', () => {
      const result = assessSuitability(venue(), event({ expectedAttendance: 100 }));

      expect(result.capacity).toEqual({
        status: CheckStatus.MET,
        venueCapacity: 100,
        expectedAttendance: 100,
      });
    });

    it('US-20: fails when attendance is one over capacity', () => {
      const result = assessSuitability(venue(), event({ expectedAttendance: 101 }));

      expect(result.capacity.status).toBe(CheckStatus.UNMET);
      expect(result.overall).toBe(OverallSuitability.NOT_SUITABLE);
    });

    it('US-20: treats a venue with no capacity as not suitable, not a pass', () => {
      const result = assessSuitability(venue({ capacity: null }), event());

      expect(result.capacity.status).toBe(CheckStatus.UNMET);
      expect(result.overallSuitable).toBe(false);
    });

    it('US-20: reports missing attendance as not recorded, making the result incomplete', () => {
      const result = assessSuitability(venue(), event({ expectedAttendance: null }));

      expect(result.capacity.status).toBe(CheckStatus.NOT_RECORDED);
      expect(result.overall).toBe(OverallSuitability.INCOMPLETE);
      expect(result.overallSuitable).toBe(false);
    });
  });

  describe('AC-2: accessibility, one flag per requirement', () => {
    it('US-20: flags each requirement individually, naming the missing one', () => {
      const result = assessSuitability(
        venue(),
        event({
          accessibilityRequirements: [
            AccessibilityFeature.STEP_FREE_ACCESS,
            AccessibilityFeature.NURSING_ROOM,
            AccessibilityFeature.HEARING_LOOP,
          ],
        }),
      );

      expect(result.accessibility).toEqual({
        status: CheckStatus.UNMET,
        items: [
          { requirement: AccessibilityFeature.STEP_FREE_ACCESS, met: true },
          { requirement: AccessibilityFeature.NURSING_ROOM, met: false },
          { requirement: AccessibilityFeature.HEARING_LOOP, met: true },
        ],
      });
    });

    it('US-20: returns one entry per unmet requirement, not an aggregate', () => {
      const result = assessSuitability(
        venue({ accessibilityFeatures: [] }),
        event({
          accessibilityRequirements: [
            AccessibilityFeature.ACCESSIBLE_PARKING,
            AccessibilityFeature.NURSING_ROOM,
          ],
        }),
      );

      expect(result.accessibility.items.filter((item) => !item.met)).toHaveLength(2);
    });

    it('US-20: an event with no accessibility needs is not-required, and passes', () => {
      const result = assessSuitability(venue(), event({ accessibilityRequirements: [] }));

      expect(result.accessibility).toEqual({ status: CheckStatus.NOT_REQUIRED, items: [] });
      expect(result.overall).toBe(OverallSuitability.SUITABLE);
    });
  });

  describe('layout (beyond the listed ACs)', () => {
    it('US-20: flags a preferred layout the venue does not support', () => {
      const result = assessSuitability(venue(), event({ preferredLayout: RoomLayout.BANQUET }));

      expect(result.layout).toEqual({ status: CheckStatus.UNMET, requirement: RoomLayout.BANQUET });
    });

    it('US-20: no preferred layout is not-required', () => {
      const result = assessSuitability(venue(), event({ preferredLayout: null }));

      expect(result.layout.status).toBe(CheckStatus.NOT_REQUIRED);
    });
  });

  describe('AC-3: facilities and equipment are not checked yet', () => {
    it('US-20: returns null for both, and says why, rather than reporting a pass', () => {
      const result = assessSuitability(venue(), event());

      expect(result.facilities).toBeNull();
      expect(result.equipment).toBeNull();
      expect(result.notChecked.map((c) => c.check)).toEqual(['facilities', 'equipment']);
    });
  });

  describe('AC-4: overall indicator', () => {
    it('US-20: is suitable only when every check passes', () => {
      const result = assessSuitability(venue(), event());

      expect(result.overall).toBe(OverallSuitability.SUITABLE);
      expect(result.overallSuitable).toBe(true);
    });

    it.each([
      ['capacity', { expectedAttendance: 500 }],
      ['accessibility', { accessibilityRequirements: [AccessibilityFeature.NURSING_ROOM] }],
      ['layout', { preferredLayout: RoomLayout.BOARDROOM }],
    ])('US-20: is not suitable when only %s fails', (_label, overrides) => {
      const result = assessSuitability(venue(), event(overrides));

      expect(result.overall).toBe(OverallSuitability.NOT_SUITABLE);
      expect(result.overallSuitable).toBe(false);
    });

    it('US-20: an unmet check outranks missing data', () => {
      const result = assessSuitability(
        venue(),
        event({ expectedAttendance: null, preferredLayout: RoomLayout.BANQUET }),
      );

      expect(result.overall).toBe(OverallSuitability.NOT_SUITABLE);
    });
  });
});
