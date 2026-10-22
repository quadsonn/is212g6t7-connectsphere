import { Injectable, Logger } from '@nestjs/common';

/**
 * Something that needs to know when an event's arrangements (venue bookings,
 * equipment reservations, technical requirements, planning status) have
 * changed.
 */
export interface ArrangementsListener {
  onArrangementsChanged(eventId: string): Promise<void>;
}

/**
 * Requirement change 6 — a one-way signal from the modules that change an
 * event's arrangements to the one that reacts to them.
 *
 * The bookings and equipment modules must not import the events module (it
 * imports them; the reverse would be a cycle), yet the Safety check has to
 * start the moment the last booking is approved or the last unit reserved.
 * They depend on this registry instead, which depends on nothing: the Safety
 * module registers itself as a listener at start-up, and the others only ever
 * say "this event's arrangements changed".
 *
 * Best-effort by design, like notifications: a listener that fails is logged
 * and must not undo the booking or reservation that triggered it. The Safety
 * queue also re-checks readiness whenever it is read, so a missed signal
 * delays an event's entry to the queue rather than losing it.
 */
@Injectable()
export class ArrangementsRegistry {
  private readonly logger = new Logger(ArrangementsRegistry.name);
  private readonly listeners = new Set<ArrangementsListener>();

  register(listener: ArrangementsListener): void {
    this.listeners.add(listener);
  }

  /** Call after the change has committed, so listeners read the new state. */
  async notifyChanged(eventId: string): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener.onArrangementsChanged(eventId);
      } catch (error) {
        this.logger.error(
          `arrangements listener failed for event ${eventId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
