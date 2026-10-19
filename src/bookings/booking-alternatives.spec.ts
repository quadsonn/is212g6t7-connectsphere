import { AccessibilityFeature, RoomLayout } from '@prisma/client';

import { CheckStatus } from '../venues/suitability';
import {
  AlternativeRequirements,
  AlternativeVenue,
  manualAlternatives,
  meetsRequirements,
  rankAlternatives,
} from './booking-alternatives';

const venue = (overrides: Partial<AlternativeVenue> & { id: string }): AlternativeVenue => ({
  name: overrides.id,
  location: null,
  capacity: 100,
  accessibilityFeatures: [],
  supportedLayouts: [],
  ...overrides,
});

const needs = (overrides: Partial<AlternativeRequirements> = {}): AlternativeRequirements => ({
  expectedAttendance: 80,
  accessibilityRequirements: [],
  preferredLayout: null,
  ...overrides,
});

/** US-41 — which venues are proposed, and in what order. Tagged "US-41 AC-n". */
describe('US-41 alternative venue ranking', () => {
  describe('US-41 AC-2: a candidate meets the capacity and accessibility requirements', () => {
    it('keeps a venue that seats the expected attendance, including exactly', () => {
      expect(meetsRequirements(venue({ id: 'a', capacity: 80 }), needs())).toBe(true);
      expect(meetsRequirements(venue({ id: 'b', capacity: 200 }), needs())).toBe(true);
    });

    it('drops a venue too small for the expected attendance', () => {
      expect(meetsRequirements(venue({ id: 'a', capacity: 79 }), needs())).toBe(false);
    });

    it('drops a venue with no capacity recorded — a data gap is not a fit', () => {
      expect(meetsRequirements(venue({ id: 'a', capacity: null }), needs())).toBe(false);
    });

    it('does not rule a venue out on capacity when the request recorded no attendance', () => {
      expect(
        meetsRequirements(venue({ id: 'a', capacity: 10 }), needs({ expectedAttendance: null })),
      ).toBe(true);
    });

    it('requires every accessibility requirement to be offered', () => {
      const required = needs({
        accessibilityRequirements: [
          AccessibilityFeature.STEP_FREE_ACCESS,
          AccessibilityFeature.HEARING_LOOP,
        ],
      });

      expect(
        meetsRequirements(
          venue({
            id: 'all',
            accessibilityFeatures: [
              AccessibilityFeature.STEP_FREE_ACCESS,
              AccessibilityFeature.HEARING_LOOP,
            ],
          }),
          required,
        ),
      ).toBe(true);
      expect(
        meetsRequirements(
          venue({ id: 'some', accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS] }),
          required,
        ),
      ).toBe(false);
    });
  });

  describe('US-41 AC-2: candidates are ranked by how well they match', () => {
    it('puts venues supporting the requested layout first', () => {
      const ranked = rankAlternatives(
        [
          venue({ id: 'no-layout', capacity: 80 }),
          venue({ id: 'theatre', capacity: 300, supportedLayouts: [RoomLayout.THEATRE] }),
        ],
        needs({ preferredLayout: RoomLayout.THEATRE }),
      );

      expect(ranked.map((r) => r.venueId)).toEqual(['theatre', 'no-layout']);
      expect(ranked.map((r) => r.layout)).toEqual([CheckStatus.MET, CheckStatus.UNMET]);
    });

    it('then the closest fit — least spare capacity', () => {
      const ranked = rankAlternatives(
        [venue({ id: 'big', capacity: 500 }), venue({ id: 'snug', capacity: 90 })],
        needs(),
      );

      expect(ranked.map((r) => [r.venueId, r.spareCapacity])).toEqual([
        ['snug', 10],
        ['big', 420],
      ]);
    });

    it('then by name, so the order is stable', () => {
      const ranked = rankAlternatives(
        [venue({ id: '2', name: 'Beta', capacity: 100 }), venue({ id: '1', name: 'Alpha', capacity: 100 })],
        needs(),
      );

      expect(ranked.map((r) => r.name)).toEqual(['Alpha', 'Beta']);
    });

    it('leaves out venues that do not meet the requirements', () => {
      const ranked = rankAlternatives(
        [venue({ id: 'small', capacity: 20 }), venue({ id: 'ok', capacity: 100 })],
        needs(),
      );

      expect(ranked.map((r) => r.venueId)).toEqual(['ok']);
    });

    it('returns the fields Venue Staff choose from', () => {
      const [only] = rankAlternatives(
        [venue({ id: 'v', name: 'Hall', location: 'Level 2', capacity: 100 })],
        needs(),
      );

      expect(only).toEqual({
        venueId: 'v',
        name: 'Hall',
        location: 'Level 2',
        capacity: 100,
        spareCapacity: 20,
        layout: CheckStatus.NOT_REQUIRED,
      });
    });
  });
});

describe('Capacity AC-3: only venues big enough for the attendance can be suggested', () => {
  // The caller passes only free venues (BookingSuggestionsService); these
  // rules decide which of them are big enough to offer.
  const free = [
    venue({ id: 'alumniLounge', capacity: 90 }),
    venue({ id: 'exactFit', capacity: 499 }),
    venue({ id: 'grandHall', capacity: 600, accessibilityFeatures: [AccessibilityFeature.STEP_FREE_ACCESS] }),
    venue({ id: 'stairsHall', capacity: 800 }),
    venue({ id: 'unknownSize', capacity: null }),
  ];
  const requirements = needs({
    expectedAttendance: 499,
    accessibilityRequirements: [AccessibilityFeature.STEP_FREE_ACCESS],
  });

  it('Capacity AC-3: the candidates exclude under-capacity venues', () => {
    expect(rankAlternatives(free, requirements).map((c) => c.venueId)).toEqual(['grandHall']);
  });

  it('Capacity AC-3: the venues offered for a manual choice exclude under-capacity ones too', () => {
    const candidates = rankAlternatives(free, requirements);

    // exactFit and stairsHall fit but lack step-free access: manual choices.
    // alumniLounge (90) and unknownSize are never offered.
    expect(manualAlternatives(free, requirements, candidates).map((v) => v.venueId)).toEqual([
      'exactFit',
      'stairsHall',
    ]);
  });

  it('Capacity AC-4: nothing is offered when no venue is big enough', () => {
    const small = [venue({ id: 'a', capacity: 90 }), venue({ id: 'b', capacity: 200 })];
    const candidates = rankAlternatives(small, requirements);

    expect(candidates).toEqual([]);
    expect(manualAlternatives(small, requirements, candidates)).toEqual([]);
  });
});
