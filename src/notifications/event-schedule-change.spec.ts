import {
  buildScheduleChangeMessage,
  scheduleChangesFrom,
  venueChange,
} from './event-schedule-change';

/** Attendee notice for a changed date, time or venue — what the message says. */
describe('event schedule change notice', () => {
  describe('AC-3: shows the event name and each changed field with old and new value', () => {
    it('formats a start change in venue (Singapore) time', () => {
      const changes = scheduleChangesFrom([
        {
          field: 'proposedStart',
          previous: '2030-10-01T01:00:00.000Z',
          next: '2030-10-02T02:30:00.000Z',
        },
      ]);

      expect(changes).toEqual([
        { label: 'Start', previous: '1 Oct 2030, 09:00', next: '2 Oct 2030, 10:30' },
      ]);
    });

    it('builds a message with the event name and old → new', () => {
      const message = buildScheduleChangeMessage('Annual Summit', [
        { label: 'Start', previous: '1 Oct 2030, 09:00', next: '2 Oct 2030, 09:00' },
      ]);

      expect(message).toBe(
        '"Annual Summit" has changed. Start: 1 Oct 2030, 09:00 → 2 Oct 2030, 09:00.',
      );
    });

    it('says "not set" when a date had no previous value', () => {
      const [change] = scheduleChangesFrom([
        { field: 'proposedEnd', previous: null, next: '2030-10-02T02:30:00.000Z' },
      ]);

      expect(change).toEqual({ label: 'End', previous: 'not set', next: '2 Oct 2030, 10:30' });
    });

    it('falls back to a generic name for an event with none', () => {
      expect(buildScheduleChangeMessage(null, [venueChange('A', 'B')])).toMatch(
        /^"An event you are registered for" has changed\./,
      );
    });
  });

  // TC-S3-42 · US-38 AC-3 · setup: none (unit) · fails if a date stored as a Date, or a value that is not a date, breaks the old → new wording
  // Code: formatValue (Date objects formatted the same as ISO strings; unparsable values shown as they are)
  describe('AC-3: values that are not ISO strings', () => {
    it('formats a Date like its ISO string, and shows an unreadable value as it is', () => {
      const iso = '2030-10-01T01:00:00.000Z';
      const [asText] = scheduleChangesFrom([{ field: 'proposedStart', previous: iso, next: 'TBC' }]);
      const [asDate] = scheduleChangesFrom([{ field: 'proposedStart', previous: new Date(iso), next: 'TBC' }]);

      expect(asDate.previous).toBe(asText.previous);
      expect(asDate.next).toBe('TBC');
    });
  });

  describe('AC-4: several fields changed in one update are one message', () => {
    it('lists Start, End and Venue together, in a fixed order', () => {
      const start = scheduleChangesFrom([
        { field: 'proposedEnd', previous: '2030-10-01T08:00:00Z', next: '2030-10-01T09:00:00Z' },
        { field: 'proposedStart', previous: '2030-10-01T01:00:00Z', next: '2030-10-01T02:00:00Z' },
      ]);

      expect(start.map((c) => c.label)).toEqual(['Start', 'End']);

      const message = buildScheduleChangeMessage('Gala', [...start, venueChange('Hall A', 'Hall B')]);

      expect(message).toBe(
        '"Gala" has changed. Start: 1 Oct 2030, 09:00 → 1 Oct 2030, 10:00; ' +
          'End: 1 Oct 2030, 16:00 → 1 Oct 2030, 17:00; Venue: Hall A → Hall B.',
      );
    });
  });

  describe('AC-5: a venue change names the affected venue', () => {
    it('shows the venue that was replaced and its replacement', () => {
      expect(venueChange('Hall A', 'Hall B')).toEqual({
        label: 'Venue',
        previous: 'Hall A',
        next: 'Hall B',
      });
    });

    it('copes with an unnamed venue', () => {
      expect(venueChange(null, null)).toEqual({
        label: 'Venue',
        previous: 'a previous venue',
        next: 'a new venue',
      });
    });
  });

  describe('AC-6: other fields never produce a change', () => {
    it.each([
      'description',
      'name',
      'purpose',
      'programme',
      'expectedAttendance',
      'preferredLayout',
      'equipmentRequirements',
      'registrationEnabled',
      'status',
    ])('ignores %s', (field) => {
      expect(scheduleChangesFrom([{ field, previous: 'a', next: 'b' }])).toEqual([]);
    });

    it('keeps only the date fields of a mixed edit', () => {
      const changes = scheduleChangesFrom([
        { field: 'description', previous: 'a', next: 'b' },
        { field: 'proposedStart', previous: '2030-10-01T01:00:00Z', next: '2030-10-01T02:00:00Z' },
        { field: 'expectedAttendance', previous: 1, next: 2 },
      ]);

      expect(changes.map((c) => c.label)).toEqual(['Start']);
    });

    it('returns nothing for an empty list', () => {
      expect(scheduleChangesFrom([])).toEqual([]);
    });
  });
});
