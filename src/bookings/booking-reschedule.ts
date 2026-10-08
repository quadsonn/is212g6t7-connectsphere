/**
 * US-38 — moving a venue booking when its event is rescheduled.
 *
 * Pure, so the arithmetic is unit-tested without a database. The booking is
 * moved by the same amount the event moved, rather than snapped to the event's
 * new times, so the setup and teardown time a booking deliberately allows
 * around the event (see VenueBooking in schema.prisma) is kept.
 */
export interface TimeWindow {
  start: Date;
  end: Date;
}

/** Whether an event's start or end is different in `to`. */
export function windowMoved(from: TimeWindow, to: TimeWindow): boolean {
  return (
    from.start.getTime() !== to.start.getTime() ||
    from.end.getTime() !== to.end.getTime()
  );
}

/**
 * Where a booking lands when its event moves from `from` to `to`: the start
 * shifts by how far the event's start moved, the end by how far its end moved.
 *
 * If shortening the event would leave the booking ending before it starts, the
 * event's new window is used instead — a booking must always cover a real span.
 */
export function rescheduleWindow(
  booked: TimeWindow,
  from: TimeWindow,
  to: TimeWindow,
): TimeWindow {
  const start = new Date(
    booked.start.getTime() + (to.start.getTime() - from.start.getTime()),
  );
  const end = new Date(
    booked.end.getTime() + (to.end.getTime() - from.end.getTime()),
  );

  return end.getTime() > start.getTime()
    ? { start, end }
    : { start: to.start, end: to.end };
}
