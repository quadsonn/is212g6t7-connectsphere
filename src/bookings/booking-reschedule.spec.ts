import { rescheduleWindow, windowMoved } from './booking-reschedule';

/** US-38 — where a booking lands when its event moves. */
describe('booking reschedule rules (US-38)', () => {
  const at = (day: number, hour: number) =>
    new Date(Date.UTC(2030, 9, day, hour, 0, 0));

  const event = { start: at(1, 9), end: at(1, 17) };

  describe('windowMoved', () => {
    it('is false for the same window', () => {
      expect(windowMoved(event, { start: at(1, 9), end: at(1, 17) })).toBe(false);
    });

    it('is true when only the start differs', () => {
      expect(windowMoved(event, { start: at(1, 10), end: at(1, 17) })).toBe(true);
    });

    it('is true when only the end differs', () => {
      expect(windowMoved(event, { start: at(1, 9), end: at(1, 18) })).toBe(true);
    });
  });

  describe('rescheduleWindow', () => {
    it('moves the booking by the same amount as the event', () => {
      const booked = { start: at(1, 9), end: at(1, 17) };

      expect(rescheduleWindow(booked, event, { start: at(8, 9), end: at(8, 17) })).toEqual({
        start: at(8, 9),
        end: at(8, 17),
      });
    });

    it('keeps setup and teardown time around the event', () => {
      // Booked 1 hour before and 1 hour after the event.
      const booked = { start: at(1, 8), end: at(1, 18) };

      expect(rescheduleWindow(booked, event, { start: at(8, 9), end: at(8, 17) })).toEqual({
        start: at(8, 8),
        end: at(8, 18),
      });
    });

    it('moves only the end when only the event’s end moved', () => {
      const booked = { start: at(1, 8), end: at(1, 18) };

      expect(rescheduleWindow(booked, event, { start: at(1, 9), end: at(1, 19) })).toEqual({
        start: at(1, 8),
        end: at(1, 20),
      });
    });

    it('follows an event that moved earlier', () => {
      const booked = { start: at(8, 9), end: at(8, 17) };

      expect(
        rescheduleWindow(booked, { start: at(8, 9), end: at(8, 17) }, { start: at(2, 9), end: at(2, 17) }),
      ).toEqual({ start: at(2, 9), end: at(2, 17) });
    });

    it('falls back to the event’s new window if the booking would end before it starts', () => {
      // A 1-hour booking inside an 8-hour event; the event is cut so its end
      // moves 6 hours earlier while its start does not move.
      const booked = { start: at(1, 9), end: at(1, 10) };
      const to = { start: at(1, 9), end: at(1, 11) };

      expect(rescheduleWindow(booked, event, to)).toEqual(to);
    });
  });
});
