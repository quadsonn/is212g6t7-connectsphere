import { applicabilityErrors, capacityWarnings } from './change-request.rules';

/** US-37 — what an approval may still apply, and when to warn about capacity. */
describe('change review rules (US-37)', () => {
  const now = new Date('2026-10-06T09:00:00Z');
  const start = new Date('2026-11-01T09:00:00Z');
  const end = new Date('2026-11-01T17:00:00Z');
  const current = { proposedStart: start, proposedEnd: end };
  const nothing = { proposedStart: null, proposedEnd: null };

  // TC-S2-177 · US-37 AC-4 · unit: applicabilityErrors() · fails if an approval could leave the event with dates
  // in the past or out of order
  describe('applicabilityErrors (AC-4: approval must not leave the event invalid)', () => {
    it('allows a request that changes no dates', () => {
      expect(applicabilityErrors(current, nothing, now)).toEqual([]);
    });

    it('allows later dates with the end after the start', () => {
      expect(
        applicabilityErrors(
          current,
          {
            proposedStart: new Date('2026-12-01T09:00:00Z'),
            proposedEnd: new Date('2026-12-01T17:00:00Z'),
          },
          now,
        ),
      ).toEqual([]);
    });

    it('refuses a start that has since passed', () => {
      expect(
        applicabilityErrors(
          current,
          { proposedStart: new Date('2026-10-01T09:00:00Z'), proposedEnd: null },
          now,
        ),
      ).toContain('the proposed start is now in the past');
    });

    it('refuses an end that has since passed', () => {
      expect(
        applicabilityErrors(
          current,
          { proposedStart: null, proposedEnd: new Date('2026-10-01T09:00:00Z') },
          now,
        ),
      ).toContain('the proposed end is now in the past');
    });

    it('refuses a new start that lands after the event’s existing end', () => {
      expect(
        applicabilityErrors(
          current,
          { proposedStart: new Date('2026-11-02T09:00:00Z'), proposedEnd: null },
          now,
        ),
      ).toContain('the proposed end would not be after the start');
    });

    it('refuses a new end that lands before the event’s existing start', () => {
      expect(
        applicabilityErrors(
          current,
          { proposedStart: null, proposedEnd: new Date('2026-11-01T08:00:00Z') },
          now,
        ),
      ).toContain('the proposed end would not be after the start');
    });
  });

  // TC-S2-174 · US-37 AC-6 · unit: capacityWarnings() · fails if attendance over a booked venue's capacity gives
  // no warning, or one is given when attendance isn't changing
  describe('capacityWarnings (AC-6)', () => {
    const booking = (capacity: number | null, name: string | null = 'Main Hall') => ({
      id: 'b1',
      status: 'APPROVED',
      venue: { id: 'v1', name, capacity },
    });

    it('warns when the proposed attendance is over capacity', () => {
      const [warning] = capacityWarnings(120, [booking(100)]);

      expect(warning).toMatchObject({
        type: 'CAPACITY_EXCEEDED',
        capacity: 100,
        proposedAttendance: 120,
        venueName: 'Main Hall',
      });
      expect(warning.message).toBe(
        'The proposed attendance of 120 exceeds the capacity of Main Hall (100).',
      );
    });

    it('does not warn at exactly the capacity', () => {
      expect(capacityWarnings(100, [booking(100)])).toEqual([]);
    });

    it('does not warn when attendance is not being changed', () => {
      expect(capacityWarnings(null, [booking(10)])).toEqual([]);
    });

    it('does not guess for a venue with no recorded capacity', () => {
      expect(capacityWarnings(500, [booking(null)])).toEqual([]);
    });

    it('warns once per over-capacity booking', () => {
      expect(
        capacityWarnings(80, [booking(50), { ...booking(60), id: 'b2' }, { ...booking(90), id: 'b3' }]),
      ).toHaveLength(2);
    });

    it('names an unnamed venue plainly', () => {
      expect(capacityWarnings(80, [booking(50, null)])[0].message).toContain('the booked venue');
    });
  });
});
