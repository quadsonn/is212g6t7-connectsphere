import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Prisma, Role } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { momentLabel, slot } from './slot-label';
import { VenueActivityNotifier } from './venue-activity-notifier';

interface HoldFacts {
  id: string;
  eventId: string;
  start: Date;
  end: Date;
  holdExpiresAt: Date | null;
  venue: { name: string | null };
  event: { name: string | null; coordinatorId: string | null };
}

/**
 * US-54 AC-7 / Week 7 Change #4 — who hears about a hold, and what.
 *
 *   placed    -> the event's Coordinator                    (HOLD_PLACED)
 *   24h left  -> the Coordinator + the venue manager         (HOLD_EXPIRING)
 *   expired   -> the Coordinator + the venue manager         (HOLD_EXPIRED)
 *   released  -> the Coordinator (staff release, reschedule) (HOLD_RELEASED)
 *   converted -> the Coordinator                             (VENUE_BOOKING_DECIDED)
 *
 * "The Coordinator" is the event's assigned coordinator. An event not yet
 * assigned (Week 7 Change #5's Lead queue) goes to every Event Coordinator
 * Lead instead; if there are none, the notice is skipped and logged.
 *
 * The venue manager's half is US-40's VenueActivityNotifier, so AC-2 there
 * (only the manager) still holds. Everything is recorded with notify(input,
 * tx) inside the caller's transaction: the notice exists if and only if the
 * change did.
 */
@Injectable()
export class HoldNotifier {
  private readonly logger = new Logger(HoldNotifier.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly venueActivity: VenueActivityNotifier,
  ) {}

  async placed(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
    const hold = await this.load(tx, bookingId);
    await this.toCoordinators(
      tx,
      hold,
      NotificationType.HOLD_PLACED,
      `${venueLabel(hold)} is tentatively held for ${eventLabel(hold)} (${slot(hold.start, hold.end)}) until ${expiry(hold)}.`,
    );
  }

  async expiring(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
    const hold = await this.load(tx, bookingId);
    await this.toCoordinators(
      tx,
      hold,
      NotificationType.HOLD_EXPIRING,
      `The tentative hold on ${venueLabel(hold)} for ${eventLabel(hold)} (${slot(hold.start, hold.end)}) expires at ${expiry(hold)}. Ask Venue Staff to confirm or extend it.`,
    );
    await this.venueActivity.holdExpiring(tx, bookingId, hold.holdExpiresAt ?? new Date());
  }

  async expired(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
    const hold = await this.load(tx, bookingId);
    await this.toCoordinators(
      tx,
      hold,
      NotificationType.HOLD_EXPIRED,
      `The tentative hold on ${venueLabel(hold)} for ${eventLabel(hold)} (${slot(hold.start, hold.end)}) has expired. The venue is available again.`,
    );
    await this.venueActivity.holdExpired(tx, bookingId);
  }

  async released(tx: Prisma.TransactionClient, bookingId: string, reason: string): Promise<void> {
    const hold = await this.load(tx, bookingId);
    await this.toCoordinators(
      tx,
      hold,
      NotificationType.HOLD_RELEASED,
      // " Reason: " so the notifications page shows it apart (splitReason).
      `The tentative hold on ${venueLabel(hold)} for ${eventLabel(hold)} (${slot(hold.start, hold.end)}) was released. Reason: ${reason}.`,
    );
  }

  async converted(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
    const hold = await this.load(tx, bookingId);
    await this.toCoordinators(
      tx,
      hold,
      NotificationType.VENUE_BOOKING_DECIDED,
      `The tentative hold on ${venueLabel(hold)} for ${eventLabel(hold)} (${slot(hold.start, hold.end)}) is now a confirmed booking.`,
    );
  }

  private load(tx: Prisma.TransactionClient, id: string): Promise<HoldFacts> {
    return tx.venueBooking.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        eventId: true,
        start: true,
        end: true,
        holdExpiresAt: true,
        venue: { select: { name: true } },
        event: { select: { name: true, coordinatorId: true } },
      },
    });
  }

  private async toCoordinators(
    tx: Prisma.TransactionClient,
    hold: HoldFacts,
    type: NotificationType,
    message: string,
  ): Promise<void> {
    const recipients = hold.event.coordinatorId
      ? [hold.event.coordinatorId]
      : (
          await tx.user.findMany({
            where: { role: Role.EVENT_COORDINATOR_LEAD },
            select: { id: true },
            orderBy: { id: 'asc' },
          })
        ).map((u) => u.id);

    if (recipients.length === 0) {
      this.logger.warn(`${type} for booking ${hold.id} not sent: its event has no Coordinator and there is no Coordinator Lead`);
      return;
    }

    for (const recipientId of recipients) {
      await this.notifications.notify(
        { recipientId, type, message, relatedEventId: hold.eventId, relatedBookingId: hold.id },
        tx,
      );
    }
  }
}

const venueLabel = (h: HoldFacts) => h.venue.name ?? 'An unnamed venue';
const eventLabel = (h: HoldFacts) => (h.event.name ? `"${h.event.name}"` : 'an untitled event');
const expiry = (h: HoldFacts) => (h.holdExpiresAt ? momentLabel(h.holdExpiresAt) : 'an unknown time');
