import { AccessibilityFeature, Facility, RoomLayout } from '@prisma/client';

import {
  CheckStatus,
  OverallSuitability,
  SuitabilityEvent,
  SuitabilityVenue,
  assessSuitability,
} from './suitability';

/** US-19 — the suitability rules, one venue against one event. */
describe('US-19 venue suitability', () => {
  const venue = (overrides: Partial<SuitabilityVenue> = {}): SuitabilityVenue => ({
    capacity: 100,
    accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS, AccessibilityFeature.HEARING_LOOP],
    supportedLayouts: [RoomLayout.THEATRE, RoomLayout.CLASSROOM],
    facilities: [Facility.PROJECTOR, Facility.MICROPHONE],
    ...overrides,
  });

  const event = (overrides: Partial<SuitabilityEvent> = {}): SuitabilityEvent => ({
    expectedAttendance: 80,
    accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
    preferredLayout: RoomLayout.THEATRE,
    requiredFacilities: [Facility.PROJECTOR],
    ...overrides,
  });

  describe('AC-1: capacity', () => {
    it('US-19: passes when attendance equals capacity', () => {
      const result = assessSuitability(venue(), event({ expectedAttendance: 100 }));

      expect(result.capacity).toEqual({
        status: CheckStatus.MET,
        venueCapacity: 100,
        expectedAttendance: 100,
      });
    });

    it('US-19: fails when attendance is one over capacity', () => {
      const result = assessSuitability(venue(), event({ expectedAttendance: 101 }));

      expect(result.capacity.status).toBe(CheckStatus.UNMET);
      expect(result.overall).toBe(OverallSuitability.NOT_SUITABLE);
    });

    it('US-19: treats a venue with no capacity as not suitable, not a pass', () => {
      const result = assessSuitability(venue({ capacity: null }), event());

      expect(result.capacity.status).toBe(CheckStatus.UNMET);
      expect(result.overallSuitable).toBe(false);
    });

    it('US-19: reports missing attendance as not recorded, making the result incomplete', () => {
      const result = assessSuitability(venue(), event({ expectedAttendance: null }));

      expect(result.capacity.status).toBe(CheckStatus.NOT_RECORDED);
      expect(result.overall).toBe(OverallSuitability.INCOMPLETE);
      expect(result.overallSuitable).toBe(false);
    });
  });

  describe('AC-2: accessibility, one flag per requirement', () => {
    it('US-19: flags each requirement individually, naming the missing one', () => {
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

    it('US-19: returns one entry per unmet requirement, not an aggregate', () => {
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

    it('US-19: an event with no accessibility needs is not-required, and passes', () => {
      const result = assessSuitability(venue(), event({ accessibilityRequirements: [] }));

      expect(result.accessibility).toEqual({ status: CheckStatus.NOT_REQUIRED, items: [] });
      expect(result.overall).toBe(OverallSuitability.SUITABLE);
    });
  });

  describe('layout (beyond the listed ACs)', () => {
    it('US-19: flags a preferred layout the venue does not support', () => {
      const result = assessSuitability(venue(), event({ preferredLayout: RoomLayout.BANQUET }));

      expect(result.layout).toEqual({ status: CheckStatus.UNMET, requirement: RoomLayout.BANQUET });
    });

    it('US-19: no preferred layout is not-required', () => {
      const result = assessSuitability(venue(), event({ preferredLayout: null }));

      expect(result.layout.status).toBe(CheckStatus.NOT_REQUIRED);
    });
  });

  describe('AC-3: facilities cover the technical requirements', () => {
    it('Given every required facility is at the venue, Then facilities are met, one flag each', () => {
      const result = assessSuitability(
        venue(),
        event({ requiredFacilities: [Facility.PROJECTOR, Facility.MICROPHONE] }),
      );

      expect(result.facilities).toEqual({
        status: CheckStatus.MET,
        items: [
          { requirement: Facility.PROJECTOR, met: true },
          { requirement: Facility.MICROPHONE, met: true },
        ],
      });
    });

    it('Given a required facility the venue lacks, Then facilities are unmet and it is named', () => {
      const result = assessSuitability(
        venue(),
        event({ requiredFacilities: [Facility.PROJECTOR, Facility.STAGE] }),
      );

      expect(result.facilities.status).toBe(CheckStatus.UNMET);
      expect(result.facilities.items).toContainEqual({ requirement: Facility.STAGE, met: false });
    });

    it('Given no required facilities, Then nothing is required', () => {
      const result = assessSuitability(venue(), event({ requiredFacilities: [] }));

      expect(result.facilities).toEqual({ status: CheckStatus.NOT_REQUIRED, items: [] });
    });

    it('Given facilities are checked, Then they are no longer listed as not checked', () => {
      const result = assessSuitability(venue(), event());

      expect(result.notChecked.map((c) => c.check)).not.toContain('facilities');
    });
  });

  describe('AC-3: the equipment asked for is available', () => {
    const line = (item: string, requestedQuantity: number, availableQuantity: number | null) => ({
      item,
      requestedQuantity,
      availableQuantity,
    });

    it('Given enough units of every catalogue item, Then equipment is met', () => {
      const result = assessSuitability(venue(), event(), [line('Wireless mic', 4, 6)]);

      expect(result.equipment).toEqual({
        status: CheckStatus.MET,
        items: [{ item: 'Wireless mic', requestedQuantity: 4, availableQuantity: 6, available: true }],
      });
    });

    it('Given exactly as many units as asked for, Then that item is available', () => {
      const result = assessSuitability(venue(), event(), [line('Wireless mic', 4, 4)]);

      expect(result.equipment.items[0].available).toBe(true);
    });

    it('Given fewer units than asked for, Then equipment is unmet and the item is flagged', () => {
      const result = assessSuitability(venue(), event(), [
        line('Wireless mic', 4, 6),
        line('Laptop', 3, 1),
      ]);

      expect(result.equipment.status).toBe(CheckStatus.UNMET);
      expect(result.equipment.items[1]).toEqual({
        item: 'Laptop',
        requestedQuantity: 3,
        availableQuantity: 1,
        available: false,
      });
    });

    it('Given no equipment requested, Then nothing is required and nothing is listed as unchecked', () => {
      const result = assessSuitability(venue(), event(), []);

      expect(result.equipment).toEqual({ status: CheckStatus.NOT_REQUIRED, items: [] });
      expect(result.notChecked).toEqual([]);
    });

    it('Given a free-text line not in the catalogue, Then it is shown as not checked, never as a pass', () => {
      const result = assessSuitability(venue(), event(), [
        line('Wireless mic', 4, 6),
        line('Fog machine', 1, null),
      ]);

      expect(result.equipment.status).toBe(CheckStatus.MET);
      expect(result.equipment.items[1]).toEqual({
        item: 'Fog machine',
        requestedQuantity: 1,
        availableQuantity: null,
        available: null,
      });
      expect(result.notChecked).toEqual([
        { check: 'equipment', reason: expect.stringMatching(/1 equipment line is not linked to the catalogue/) },
      ]);
    });

    it('Given only free-text lines, Then equipment could not be checked', () => {
      const result = assessSuitability(venue(), event(), [line('Fog machine', 1, null), line('Confetti', 2, null)]);

      expect(result.equipment.status).toBe(CheckStatus.NOT_RECORDED);
      expect(result.notChecked[0].reason).toMatch(/2 equipment lines are not linked/);
    });

    it('Given equipment is short, Then the venue verdict is unchanged: equipment is the same at every venue', () => {
      const result = assessSuitability(venue(), event(), [line('Laptop', 3, 1)]);

      expect(result.equipment.status).toBe(CheckStatus.UNMET);
      expect(result.overall).toBe(OverallSuitability.SUITABLE);
    });
  });

  describe('AC-4: overall indicator', () => {
    it('US-19: is suitable only when every check passes', () => {
      const result = assessSuitability(venue(), event());

      expect(result.overall).toBe(OverallSuitability.SUITABLE);
      expect(result.overallSuitable).toBe(true);
    });

    it.each([
      ['capacity', { expectedAttendance: 500 }],
      ['accessibility', { accessibilityRequirements: [AccessibilityFeature.NURSING_ROOM] }],
      ['layout', { preferredLayout: RoomLayout.BOARDROOM }],
      ['facilities', { requiredFacilities: [Facility.STAGE] }],
    ])('US-19: is not suitable when only %s fails', (_label, overrides) => {
      const result = assessSuitability(venue(), event(overrides));

      expect(result.overall).toBe(OverallSuitability.NOT_SUITABLE);
      expect(result.overallSuitable).toBe(false);
    });

    it('US-19: an unmet check outranks missing data', () => {
      const result = assessSuitability(
        venue(),
        event({ expectedAttendance: null, preferredLayout: RoomLayout.BANQUET }),
      );

      expect(result.overall).toBe(OverallSuitability.NOT_SUITABLE);
    });
  });
});
