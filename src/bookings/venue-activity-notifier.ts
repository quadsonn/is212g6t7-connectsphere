import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { TimeWindow } from './booking-reschedule';
import { LIVE_STATUSES } from './booking.types';
import { momentLabel, slot } from './slot-label';

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
  venue: { name: string | null; managedById: string | null };
  event: { name: string | null };
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
 */
@Injectable()
export class VenueActivityNotifier {
  constructor(private readonly notifications: NotificationsService) {}

  /** AC-1: a booking request was submitted for the venue (US-21). */
  requestSubmitted(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
    return this.send(tx, bookingId, NotificationType.BOOKING_REQUEST_SUBMITTED, (b) =>
      `New booking request for ${eventLabel(b)} at ${venueLabel(b)}, ${slot(b.start, b.end)}.`,
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
        parts.push(`time ${slot(change.movedFrom.start, change.movedFrom.end)} → ${slot(b.start, b.end)}`);
      }
      if (change.attendance) {
        parts.push(`attendance ${change.attendance.from ?? 'not set'} → ${change.attendance.to}`);
      }
      const requeued = change.movedFrom ? ' It is back in your queue for a new decision.' : '';
      return `The approved booking of ${venueLabel(b)} for ${eventLabel(b)} has changed: ${parts.join('; ')}.${requeued}`;
    });
  }

  /**
   * AC-1: an event using the venue was cancelled. One notification per live
   * (REQUESTED or APPROVED) booking; rejected ones hold nothing. The booking
   * itself is left alone — releasing it is US-44's.
   */
  async eventCancelled(tx: Prisma.TransactionClient, eventId: string): Promise<void> {
    const live = await tx.venueBooking.findMany({
      where: { eventId, status: { in: LIVE_STATUSES } },
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });

    for (const { id } of live) {
      await this.send(tx, id, NotificationType.BOOKING_EVENT_CANCELLED, (b) =>
        `${capitalise(eventLabel(b))} has been cancelled. It had a booking of ${venueLabel(b)} for ${slot(b.start, b.end)}.`,
      );
    }
  }

  /** AC-1: a tentative hold is about to expire. UNWIRED — for US-54. */
  holdExpiring(tx: Prisma.TransactionClient, bookingId: string, expiresAt: Date): Promise<void> {
    return this.send(tx, bookingId, NotificationType.HOLD_EXPIRING, (b) =>
      `The tentative hold on ${venueLabel(b)} for ${eventLabel(b)} (${slot(b.start, b.end)}) expires at ${momentLabel(expiresAt)}.`,
    );
  }

  /** AC-1: a tentative hold has expired. UNWIRED — for US-54. */
  holdExpired(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
    return this.send(tx, bookingId, NotificationType.HOLD_EXPIRED, (b) =>
      `The tentative hold on ${venueLabel(b)} for ${eventLabel(b)} (${slot(b.start, b.end)}) has expired.`,
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
        venue: { select: { name: true, managedById: true } },
        event: { select: { name: true } },
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

const venueLabel = (b: BookingFacts) => b.venue.name ?? 'an unnamed venue';
const eventLabel = (b: BookingFacts) => (b.event.name ? `"${b.event.name}"` : 'an untitled event');
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
