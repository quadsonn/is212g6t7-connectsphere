import { EventStatus } from '@prisma/client';

import {
  conflictingAssignments,
  requiresTechnicalSupport,
  TECH_SUPPORT_ASSIGNABLE_STATUSES,
  windowsOverlap,
} from './technical-support.rules';

const at = (time: string, day = '2030-10-01') => new Date(`${day}T${time}:00Z`);

describe('Technical Support assignment rules (US-61)', () => {
  describe('AC-1: an event is marked as requiring technical support', () => {
    it('US-61 AC-1: recorded technical support needs mark the event as requiring support', () => {
      expect(requiresTechnicalSupport({ technicalSupportNeeds: 'On-site AV technician' })).toBe(true);
    });

    it.each([null, '', '   '])(
      'US-61 AC-1: %p technical support needs do not',
      (technicalSupportNeeds) => {
        expect(requiresTechnicalSupport({ technicalSupportNeeds })).toBe(false);
      },
    );
  });

  describe('AC-2: overlapping date and time', () => {
    const window = { start: at('10:00'), end: at('12:00') };

    it('US-61 AC-2: a partly overlapping assignment conflicts', () => {
      expect(windowsOverlap(window, { start: at('11:00'), end: at('13:00') })).toBe(true);
    });

    it('US-61 AC-2: one that contains the window conflicts', () => {
      expect(windowsOverlap(window, { start: at('09:00'), end: at('15:00') })).toBe(true);
    });

    it('US-61 AC-2: back-to-back events do not conflict (half-open windows)', () => {
      expect(windowsOverlap(window, { start: at('12:00'), end: at('14:00') })).toBe(false);
      expect(windowsOverlap(window, { start: at('08:00'), end: at('10:00') })).toBe(false);
    });

    it('US-61 AC-2: the same time on another day does not conflict', () => {
      expect(
        windowsOverlap(window, { start: at('10:00', '2030-10-02'), end: at('12:00', '2030-10-02') }),
      ).toBe(false);
    });

    it('US-61 AC-2: lists only the overlapping assignments, never the event itself', () => {
      const assignments = [
        { eventId: 'EVT-001', name: 'This event', start: at('10:00'), end: at('12:00') },
        { eventId: 'EVT-002', name: 'Clash', start: at('11:00'), end: at('12:30') },
        { eventId: 'EVT-003', name: 'Later', start: at('13:00'), end: at('14:00') },
      ];

      expect(conflictingAssignments('EVT-001', window, assignments).map((a) => a.eventId)).toEqual([
        'EVT-002',
      ]);
    });
  });

  describe('which events count', () => {
    it('US-61: ended events (cancelled, rejected, completed) neither take nor hold an assignee', () => {
      for (const status of [EventStatus.CANCELLED, EventStatus.REJECTED, EventStatus.COMPLETED]) {
        expect(TECH_SUPPORT_ASSIGNABLE_STATUSES).not.toContain(status);
      }
    });

    it('US-61: events from planning to confirmed may be assigned', () => {
      expect(TECH_SUPPORT_ASSIGNABLE_STATUSES).toEqual(
        expect.arrayContaining([EventStatus.PLANNING, EventStatus.CONFIRMED]),
      );
      expect(TECH_SUPPORT_ASSIGNABLE_STATUSES).not.toContain(EventStatus.DRAFT);
    });
  });
});
