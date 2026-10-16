import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EquipmentRequirement,
  EventStatus,
  NotificationType,
  Prisma,
  ReservationStatus,
} from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { lockVenue } from '../bookings/venue-lock';
import {
  AccessControlService,
  EventWithCoordinator,
} from '../common/access/access-control.service';
import { Action } from '../common/access/permission.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmationReadiness,
  evaluateConfirmationReadiness,
} from './confirmation-readiness.rules';
import { CONFIRMABLE_STATUSES } from './event-status.machine';
import { EventsService } from './events.service';

type Db = Prisma.TransactionClient | PrismaService;

/** AC-5 — the words the Organiser sees, here and on their event view. */
export const ARRANGEMENTS_CONFIRMED_MESSAGE =
  'Arrangements confirmed - awaiting safety review';

/**
 * US-42 — the assigned Coordinator confirms that an event's arrangements are
 * ready, handing it to the Safety Officer (Week 7 Change #6; US-57 decides
 * what happens next).
 *
 * Readiness is computed fresh on every call from the bookings, requirements
 * and reservations; nothing about it is stored. The only things written are
 * the status (through EventsService.setStatus) and the manual ticks on
 * free-text equipment lines.
 */
@Injectable()
export class EventConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * AC-1/AC-2 — what is ready and what is still outstanding. Takes a
   * transaction client so confirm() can re-run it under the venue locks.
   */
  async getConfirmationReadiness(
    eventId: string,
    tx: Db = this.prisma,
  ): Promise<ConfirmationReadiness> {
    const [bookings, requirements, reservations] = await Promise.all([
      tx.venueBooking.findMany({
        where: { eventId },
        orderBy: [{ start: 'asc' }, { id: 'asc' }],
        select: { status: true, needsReview: true, holdExpiresAt: true, venue: { select: { name: true } } },
      }),
      tx.equipmentRequirement.findMany({
        where: { eventId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          equipmentId: true,
          equipmentType: true,
          quantity: true,
          manuallyConfirmedAt: true,
        },
      }),
      tx.equipmentReservation.findMany({
        where: { eventId, status: ReservationStatus.APPROVED },
        select: { equipmentId: true, quantity: true, status: true },
      }),
    ]);

    return evaluateConfirmationReadiness({
      bookings: bookings.map((b) => ({
        venueName: b.venue.name ?? 'an unnamed venue',
        status: b.status,
        needsReview: b.needsReview,
        holdExpiresAt: b.holdExpiresAt,
      })),
      requirements,
      reservations,
    });
  }

  /** GET /events/:id/confirmation-readiness — the assigned Coordinator's checklist. */
  async readinessFor(user: AuthenticatedUser, id: string): Promise<ConfirmationReadiness> {
    await this.assertAssigned(user, id);

    return this.getConfirmationReadiness(id);
  }

  /**
   * AC-3/AC-4 — PLANNING or AWAITING_ARRANGEMENTS -> AWAITING_SAFETY_CHECK.
   *
   * The checklist the Coordinator saw may be stale by the time they press
   * Confirm, so readiness is re-run inside the transaction, after taking the
   * same per-venue locks booking decisions take (lockVenue). A decision
   * reversed a moment earlier is therefore either visible to the re-check or
   * waits until the status has changed. Not ready -> 409 with the items.
   */
  async confirm(user: AuthenticatedUser, id: string) {
    await this.assertAssigned(user, id);

    const confirmed = await this.prisma.$transaction(async (tx) => {
      const venues = await tx.venueBooking.findMany({
        where: { eventId: id },
        distinct: ['venueId'],
        select: { venueId: true },
      });
      // Sorted, so two transactions locking the same venues cannot deadlock.
      for (const venueId of venues.map((v) => v.venueId).sort()) {
        await lockVenue(tx, venueId);
      }

      const event = await tx.eventRequest.findUniqueOrThrow({ where: { id } });
      if (!CONFIRMABLE_STATUSES.includes(event.status)) {
        throw new ConflictException(
          `event is ${event.status}; arrangements can only be confirmed during planning`,
        );
      }

      const readiness = await this.getConfirmationReadiness(id, tx);
      if (!readiness.ready) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'arrangements are not ready to confirm',
          items: readiness.items,
        });
      }

      return this.events.setStatus(event, EventStatus.AWAITING_SAFETY_CHECK, tx, user.userId);
    });

    // AC-5: raised after commit, so a failed notification cannot undo the
    // confirmation (see NotificationsService.notifySafely).
    await this.notifications.notifySafely({
      recipientId: confirmed.organiserId,
      type: NotificationType.EVENT_STATUS_CHANGED,
      message: `"${confirmed.name ?? 'Your event'}": ${ARRANGEMENTS_CONFIRMED_MESSAGE}.`,
      relatedEventId: confirmed.id,
    });

    return confirmed;
  }

  /**
   * A free-text equipment line names no catalogue item, so nothing can be
   * reserved against it: the Coordinator ticks it once checked by hand.
   */
  async manualConfirm(
    user: AuthenticatedUser,
    eventId: string,
    requirementId: string,
  ): Promise<EquipmentRequirement> {
    await this.findFreeTextLine(user, eventId, requirementId);

    return this.prisma.equipmentRequirement.update({
      where: { id: requirementId },
      data: { manuallyConfirmedAt: new Date(), manuallyConfirmedById: user.userId },
    });
  }

  /** Undoes manualConfirm(). */
  async undoManualConfirm(
    user: AuthenticatedUser,
    eventId: string,
    requirementId: string,
  ): Promise<EquipmentRequirement> {
    await this.findFreeTextLine(user, eventId, requirementId);

    return this.prisma.equipmentRequirement.update({
      where: { id: requirementId },
      data: { manuallyConfirmedAt: null, manuallyConfirmedById: null },
    });
  }

  private async findFreeTextLine(
    user: AuthenticatedUser,
    eventId: string,
    requirementId: string,
  ): Promise<EquipmentRequirement> {
    await this.assertAssigned(user, eventId);

    const line = await this.prisma.equipmentRequirement.findFirst({
      where: { id: requirementId, eventId },
    });
    if (!line) {
      throw new NotFoundException('equipment requirement not found');
    }
    if (line.equipmentId !== null) {
      throw new BadRequestException(
        'only free-text equipment lines are checked by hand; catalogue items are satisfied by reservations',
      );
    }

    return line;
  }

  /**
   * AC-3 — only the assigned Coordinator. Loaded through EVENT/ASSIGN (ANY
   * scope), as US-27's reassignment does, so another Coordinator gets an
   * explicit 403 rather than a 404.
   */
  private async assertAssigned(
    user: AuthenticatedUser,
    id: string,
  ): Promise<EventWithCoordinator> {
    const event = await this.access.assertEventAccess(user, id, Action.ASSIGN);

    if (!this.access.isAssignedCoordinator(user, event)) {
      throw new ForbiddenException(
        'only the coordinator assigned to this event may confirm its arrangements',
      );
    }

    return event;
  }
}
