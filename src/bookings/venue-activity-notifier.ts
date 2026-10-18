import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { TimeWindow } from './booking-reschedule';
import { shortMoment, shortSlot } from './slot-label';

/** What changed on an approved booking (US-40 AC-1). */
export interface ApprovedBookingChange {
  /** The booking's slot before the change; its new slot is read from the row. */
  movedFrom?: TimeWindow;
  attendance?: { from: number | null; to: number };
}

interface BookingFacts {
  id: string;
  eventId: string;
  start: Date;
  end: Date;
  venue: { managedById: string | null };
}

/**
 * US-40 — venue activity notifications for Venue Staff.
 *
 * The one place that decides who hears about activity on a venue: always the
 * venue's manager (Venue.managedById), read inside the caller's transaction,
 * and nobody when the venue has no manager (AC-2). Other Venue Staff are never
 * recipients.
 *
 * Every method takes the triggering transaction and records through
 * NotificationsService.notify(input, tx), so a notification exists if and only
 * if the action that caused it committed. Each records one notification per
 * booking, naming the venue and event, what happened and when, and linking to
 * the booking request (AC-3).
 *
 * Messages are short and leave out the venue and event names: every reader
 * shows them beside the message from relatedBooking and relatedEvent, and the
 * frontend gives each type its own title ("New booking request", …).
 */
@Injectable()
export class VenueActivityNotifier {
  constructor(private readonly notifications: NotificationsService) {}

  /** AC-1: a booking request was submitted for the venue (US-21). */
  requestSubmitted(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
    return this.send(tx, bookingId, NotificationType.BOOKING_REQUEST_SUBMITTED, (b) =>
      `Requested for ${shortSlot(b.start, b.end)}.`,
    );
  }

  /**
   * AC-1: an APPROVED booking's date, time or attendance changed (US-48
   * approving a change request). Call after the booking has been moved, so its
   * new slot is what is read. A moved booking goes back to REQUESTED
   * (rescheduleForEventChange), which the message says.
   */
  approvedBookingChanged(
    tx: Prisma.TransactionClient,
    bookingId: string,
    change: ApprovedBookingChange,
  ): Promise<void> {
    return this.send(tx, bookingId, NotificationType.BOOKING_DETAILS_CHANGED, (b) => {
      const parts: string[] = [];
      if (change.movedFrom) {
        parts.push(`Time ${shortSlot(change.movedFrom.start, change.movedFrom.end)} → ${shortSlot(b.start, b.end)}.`);
      }
      if (change.attendance) {
        parts.push(`Attendance ${change.attendance.from ?? 'not set'} → ${change.attendance.to}.`);
      }
      if (change.movedFrom) parts.push('Back in your queue for a new decision.');
      return parts.join(' ');
    });
  }

  /**
   * AC-1 / US-44 AC-5: an event using the venue was cancelled, and so this
   * booking of it has been released. One notice per released booking, sent by
   * BookingsService.releaseForCancelledEvent in the cancelling transaction.
   */
  bookingReleasedForCancellation(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
    return this.send(tx, bookingId, NotificationType.BOOKING_EVENT_CANCELLED, (b) =>
      `Booking for ${shortSlot(b.start, b.end)} released.`,
    );
  }

  /** AC-1: a tentative hold is about to expire (US-54's expiry job). */
  holdExpiring(tx: Prisma.TransactionClient, bookingId: string, expiresAt: Date): Promise<void> {
    return this.send(tx, bookingId, NotificationType.HOLD_EXPIRING, (b) =>
      `Hold for ${shortSlot(b.start, b.end)} expires ${shortMoment(expiresAt)}.`,
    );
  }

  /** AC-1: a tentative hold has expired (US-54's releaseExpiredHolds). */
  holdExpired(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
    return this.send(tx, bookingId, NotificationType.HOLD_EXPIRED, (b) =>
      `Hold for ${shortSlot(b.start, b.end)} has expired. The slot is free again.`,
    );
  }

  private async send(
    tx: Prisma.TransactionClient,
    bookingId: string,
    type: NotificationType,
    describe: (booking: BookingFacts) => string,
  ): Promise<void> {
    const booking = await tx.venueBooking.findUniqueOrThrow({
      where: { id: bookingId },
      select: {
        id: true,
        eventId: true,
        start: true,
        end: true,
        venue: { select: { managedById: true } },
      },
    });

    // AC-2: the venue's manager only; an unmanaged venue tells no one.
    const recipientId = booking.venue.managedById;
    if (!recipientId) return;

    await this.notifications.notify(
      {
        recipientId,
        type,
        message: describe(booking),
        relatedEventId: booking.eventId,
        relatedBookingId: booking.id,
      },
      tx,
    );
  }
}
