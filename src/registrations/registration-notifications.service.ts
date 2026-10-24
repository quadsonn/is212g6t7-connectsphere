import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  EventStatus,
  NotificationType,
  Prisma,
  RegistrationStatus,
  Role,
} from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveWindow } from './registration-rules';
import { isNearCapacity, venueCapacityOf } from './registration-notifications';

/** The three "already sent" stamps on EventRequest, one per notice. */
type NoticeStamp =
  | 'registrationOpenedNotifiedAt'
  | 'registrationClosedNotifiedAt'
  | 'registrationNearCapacityNotifiedAt';

/**
 * US — notify attendees when registration opens, closes or nears capacity.
 *
 * The three moments are detected by sweeping the events, not by hooking every
 * action that could cause them: a registration, a venue-capacity change and
 * the passing of the close time would otherwise each need their own trigger.
 * One sweep over the current state catches all of them, exactly as the
 * hold-expiry job does for holds.
 *
 * Each notice is sent once per event. Under a row lock on the event, the sweep
 * reads the event's "…NotifiedAt" stamp and, only if it is still unset, writes
 * it and records the notices in the same transaction: a second run, or a
 * second instance, waits on the lock and then finds the stamp set, so it does
 * nothing. The stamp is written with a plain `update` that never touches
 * `status`, so the US-11 status-write guard is unaffected (events-status-audit).
 *
 * ScheduleModule is not registered under test (app.module.ts), so tests call
 * these methods directly.
 */
@Injectable()
export class RegistrationNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * AC — when an event first becomes visible to attendees (it is CONFIRMED
   * with registration enabled), every ATTENDEE who is not registered for it is
   * notified, with a link to the event. Returns the events notified.
   */
  async notifyOpened(now: Date = new Date()): Promise<string[]> {
    const candidates = await this.prisma.eventRequest.findMany({
      where: {
        status: EventStatus.CONFIRMED,
        registrationEnabled: true,
        registrationOpenedNotifiedAt: null,
      },
      select: { id: true, name: true },
    });

    const notified: string[] = [];
    for (const event of candidates) {
      const sent = await this.prisma.$transaction(async (tx) => {
        if (!(await this.claim(tx, event.id, 'registrationOpenedNotifiedAt', now))) {
          return false;
        }

        const [attendees, registered] = await Promise.all([
          tx.user.findMany({ where: { role: Role.ATTENDEE }, select: { id: true } }),
          tx.registration.findMany({
            where: { eventId: event.id, status: RegistrationStatus.REGISTERED },
            select: { attendeeId: true },
          }),
        ]);
        const alreadyRegistered = new Set(registered.map((r) => r.attendeeId));
        const recipients = attendees
          .map((a) => a.id)
          .filter((id) => !alreadyRegistered.has(id));

        await this.notifications.notifyMany(
          recipients.map((recipientId) => ({
            recipientId,
            type: NotificationType.REGISTRATION_OPENED,
            message: `Registration is now open for "${event.name ?? 'an event'}".`,
            relatedEventId: event.id,
          })),
          tx,
        );
        return true;
      });
      if (sent) notified.push(event.id);
    }
    return notified;
  }

  /**
   * AC — when the registration window closes, the attendees registered for the
   * event are notified, with a link. Returns the events notified.
   */
  async notifyClosed(now: Date = new Date()): Promise<string[]> {
    const candidates = await this.prisma.eventRequest.findMany({
      where: {
        status: EventStatus.CONFIRMED,
        registrationEnabled: true,
        registrationClosedNotifiedAt: null,
      },
      select: {
        id: true,
        name: true,
        proposedStart: true,
        registrationOpensAt: true,
        registrationClosesAt: true,
        withdrawalCutoffAt: true,
      },
    });

    const notified: string[] = [];
    for (const event of candidates) {
      const { closesAt } = resolveWindow(event);
      // Not closed yet (or no close time at all) — nothing to claim.
      if (!closesAt || now <= closesAt) continue;

      const sent = await this.prisma.$transaction(async (tx) => {
        if (!(await this.claim(tx, event.id, 'registrationClosedNotifiedAt', now))) {
          return false;
        }
        await this.notifyRegistered(
          tx,
          event.id,
          NotificationType.REGISTRATION_CLOSED,
          `Registration has closed for "${event.name ?? 'an event'}".`,
        );
        return true;
      });
      if (sent) notified.push(event.id);
    }
    return notified;
  }

  /**
   * AC — the first time an event has 10 or fewer seats left against its venue
   * capacity (whether registrations rose or the venue capacity fell), the
   * attendees registered for it are notified, with a link. Sent once ever.
   * Returns the events notified.
   */
  async notifyNearCapacity(now: Date = new Date()): Promise<string[]> {
    const candidates = await this.prisma.eventRequest.findMany({
      where: {
        status: EventStatus.CONFIRMED,
        registrationEnabled: true,
        registrationNearCapacityNotifiedAt: null,
      },
      select: { id: true, name: true },
    });

    const notified: string[] = [];
    for (const event of candidates) {
      const sent = await this.prisma.$transaction(async (tx) => {
        // Lock first so a registration for the last seats cannot land between
        // the count and the claim; the register path locks the same row.
        await this.lock(tx, event.id);

        const [bookings, registeredCount, current] = await Promise.all([
          tx.venueBooking.findMany({
            where: { eventId: event.id, status: BookingStatus.APPROVED },
            select: { venue: { select: { capacity: true } } },
          }),
          tx.registration.count({
            where: { eventId: event.id, status: RegistrationStatus.REGISTERED },
          }),
          tx.eventRequest.findUnique({
            where: { id: event.id },
            select: { registrationNearCapacityNotifiedAt: true },
          }),
        ]);

        if (current?.registrationNearCapacityNotifiedAt) return false;

        const capacity = venueCapacityOf(bookings.map((b) => b.venue?.capacity ?? null));
        if (!isNearCapacity(capacity, registeredCount)) return false;

        await tx.eventRequest.update({
          where: { id: event.id },
          data: { registrationNearCapacityNotifiedAt: now },
        });

        // capacity is non-null here (isNearCapacity returned true).
        const left = Math.max(0, capacity! - registeredCount);
        const message =
          left === 0
            ? `"${event.name ?? 'An event'}" is now full.`
            : `Only ${left} ${left === 1 ? 'place' : 'places'} left for "${
                event.name ?? 'an event'
              }".`;

        await this.notifyRegistered(
          tx,
          event.id,
          NotificationType.REGISTRATION_NEAR_CAPACITY,
          message,
        );
        return true;
      });
      if (sent) notified.push(event.id);
    }
    return notified;
  }

  /**
   * Claim a one-time notice under a row lock: true if this call set the stamp,
   * false if it was already set. Uses a plain `update` (never `status`), so the
   * US-11 status-write guard is unaffected.
   */
  private async claim(
    tx: Prisma.TransactionClient,
    eventId: string,
    stamp: NoticeStamp,
    now: Date,
  ): Promise<boolean> {
    await this.lock(tx, eventId);

    const current = await tx.eventRequest.findUnique({
      where: { id: eventId },
      select: {
        registrationOpenedNotifiedAt: true,
        registrationClosedNotifiedAt: true,
        registrationNearCapacityNotifiedAt: true,
      },
    });
    if (!current || current[stamp]) return false;

    await tx.eventRequest.update({
      where: { id: eventId },
      data: { [stamp]: now },
    });
    return true;
  }

  /** Row-lock the event so concurrent sweeps/registrations serialise on it. */
  private async lock(tx: Prisma.TransactionClient, eventId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "EventRequest" WHERE "id" = ${eventId} FOR UPDATE`;
  }

  /** Notify every attendee currently registered for the event. */
  private async notifyRegistered(
    tx: Prisma.TransactionClient,
    eventId: string,
    type: NotificationType,
    message: string,
  ): Promise<void> {
    const registered = await tx.registration.findMany({
      where: { eventId, status: RegistrationStatus.REGISTERED },
      select: { attendeeId: true },
    });
    await this.notifications.notifyMany(
      registered.map((r) => ({
        recipientId: r.attendeeId,
        type,
        message,
        relatedEventId: eventId,
      })),
      tx,
    );
  }
}
