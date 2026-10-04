import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EquipmentStatus,
  EventStatus,
  NotificationType,
  Prisma,
  ReservationStatus,
} from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EQUIPMENT_COMMITTABLE_STATUSES } from '../events/event-status.machine';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommitReservationDto } from './dto/commit-reservation.dto';
import {
  computeItemAvailability,
  holdingReservationsWhere,
  ItemAvailability,
} from './equipment-availability';

/**
 * US-33 AC-1/AC-4 — the statuses a release moves out of. RELEASED is absent,
 * so an already-released reservation is never released again; REJECTED is
 * absent because a rejected reservation holds nothing to give back.
 */
export const RELEASABLE_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.REQUESTED,
  ReservationStatus.APPROVED,
];

/**
 * US-32 — limits for the commit transaction. A commit may legitimately wait
 * on the equipment row lock while another commit of the same item finishes,
 * so Prisma's defaults (2s to start, 5s to run) are raised to leave room for
 * that wait under load rather than failing the request with a 500.
 */
export const COMMIT_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 15_000,
} as const;

/** US-32 — what a confirmed commitment returns to the caller. */
export const RESERVATION_SELECT = {
  id: true,
  eventId: true,
  equipmentId: true,
  quantity: true,
  start: true,
  end: true,
  status: true,
  createdAt: true,
  equipment: { select: { id: true, type: true } },
} as const satisfies Prisma.EquipmentReservationSelect;

export type CommittedReservation = Prisma.EquipmentReservationGetPayload<{
  select: typeof RESERVATION_SELECT;
}>;

/** US-33 AC-3 — a released reservation, with the cancelled event it belonged to. */
export const RELEASED_SELECT = {
  id: true,
  quantity: true,
  start: true,
  end: true,
  status: true,
  releasedAt: true,
  equipment: { select: { id: true, type: true } },
  event: { select: { id: true, name: true, status: true } },
} as const satisfies Prisma.EquipmentReservationSelect;

export type ReleasedReservation = Prisma.EquipmentReservationGetPayload<{
  select: typeof RELEASED_SELECT;
}>;

/**
 * E6 — committing equipment to events (US-32) and giving it back when an
 * event is cancelled (US-33).
 *
 * This is the only place EquipmentReservation.status is written
 * (events-status-audit.spec.ts enforces it), mirroring EventsService.setStatus
 * for events: a commitment is created as APPROVED here, and leaves that
 * status only through releaseForCancelledEvent().
 */
@Injectable()
export class EquipmentReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * US-32 AC-1/AC-2/AC-3 — commit a quantity of one item to an event for the
   * event's date and time.
   *
   * AC-2 "immediately locked": the availability check and the insert run in
   * one transaction holding a row lock on the Equipment item, so two
   * commitments of the same item are serialised — the second sees the first's
   * units as taken. Without the lock, both could read the same free count and
   * both succeed, over-committing the item.
   *
   * The event row is share-locked too, so a concurrent cancellation (US-33)
   * either finishes first — and this commit sees CANCELLED and is refused —
   * or waits until this commit lands, and then releases it.
   */
  async commit(
    user: AuthenticatedUser,
    dto: CommitReservationDto,
  ): Promise<CommittedReservation> {
    this.access.requireScope(user, Resource.RESERVATION, Action.CREATE);

    const { reservation, event } = await this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, dto.eventId);
      await this.lockEquipment(tx, dto.equipmentId);

      const window = { start: event.proposedStart, end: event.proposedEnd };

      // Shared with US-30: the same equipment fields, the same definition of
      // "held", the same arithmetic. Only the decision on the result is ours.
      const [equipment, held] = await Promise.all([
        tx.equipment.findUniqueOrThrow({
          where: { id: dto.equipmentId },
          select: {
            id: true,
            type: true,
            totalQuantity: true,
            operationalStatus: true,
          },
        }),
        tx.equipmentReservation.findMany({
          where: holdingReservationsWhere([dto.equipmentId], window),
          select: { quantity: true, start: true, end: true },
        }),
      ]);

      const availability = computeItemAvailability({
        equipment,
        requestedQuantity: dto.quantity,
        reservations: held,
        window,
      });

      // AC-3: refused, with the reason.
      if (!availability.fullyAvailable) {
        throw new ConflictException(rejectionReason(availability, window));
      }

      const reservation = await tx.equipmentReservation.create({
        data: {
          eventId: event.id,
          equipmentId: equipment.id,
          quantity: dto.quantity,
          start: window.start,
          end: window.end,
          status: ReservationStatus.APPROVED,
        },
        select: RESERVATION_SELECT,
      });

      return { reservation, event };
    }, COMMIT_TRANSACTION_OPTIONS);

    // AC-4: only once the commitment is confirmed (committed), and
    // best-effort — a notification failure must not undo the commitment.
    if (event.coordinatorId) {
      await this.notifications.notifySafely({
        recipientId: event.coordinatorId,
        type: NotificationType.EQUIPMENT_RESERVATION_DECIDED,
        message: `${reservation.quantity} × ${reservation.equipment.type} committed to "${event.name ?? 'your event'}" for ${reservation.start.toISOString()} – ${reservation.end.toISOString()}.`,
        relatedEventId: event.id,
      });
    }

    return reservation;
  }

  /**
   * US-33 AC-1/AC-4 — release every reservation the event still holds.
   *
   * Called by EventsService.setStatus() inside the same transaction as the
   * status change to CANCELLED, so the event can never be cancelled with its
   * equipment still locked (or vice versa). AC-2 then needs nothing further:
   * availability counts only APPROVED reservations, and these are now
   * RELEASED.
   *
   * Scoped by eventId (only that event's reservations) and by status (an
   * already-released one is not released again, so a repeat call is a no-op
   * that returns 0).
   */
  async releaseForCancelledEvent(
    eventId: string,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const event = await tx.eventRequest.findUnique({
      where: { id: eventId },
      select: { status: true },
    });

    // A guard on the contract, not a user-facing rule: releasing a live
    // event's equipment would silently free units it still needs.
    if (event?.status !== EventStatus.CANCELLED) {
      throw new ConflictException(
        'equipment can only be released for a cancelled event',
      );
    }

    const result = await tx.equipmentReservation.updateMany({
      where: { eventId, status: { in: [...RELEASABLE_STATUSES] } },
      data: { status: ReservationStatus.RELEASED, releasedAt: new Date() },
    });

    return result.count;
  }

  /** US-33 AC-3 — which reservations were released, and for which event. */
  async findReleased(user: AuthenticatedUser): Promise<ReleasedReservation[]> {
    this.access.requireScope(user, Resource.RESERVATION, Action.READ);

    return this.prisma.equipmentReservation.findMany({
      where: { status: ReservationStatus.RELEASED },
      orderBy: [{ releasedAt: 'desc' }, { id: 'asc' }],
      select: RELEASED_SELECT,
    });
  }

  /**
   * Share-locks the event for the rest of the transaction and checks it can
   * take a commitment. FOR SHARE blocks a concurrent status change (which
   * takes a row-level write lock) without blocking other commitments.
   */
  private async lockEvent(tx: Prisma.TransactionClient, eventId: string) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "EventRequest" WHERE "id" = ${eventId} FOR SHARE`;

    if (locked.length === 0) {
      throw new NotFoundException('event not found');
    }

    const event = await tx.eventRequest.findUniqueOrThrow({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        status: true,
        coordinatorId: true,
        proposedStart: true,
        proposedEnd: true,
      },
    });

    if (!EQUIPMENT_COMMITTABLE_STATUSES.includes(event.status)) {
      throw new ConflictException(
        `equipment cannot be committed to an event that is ${event.status}`,
      );
    }

    // Unreachable for a non-draft event (the completeness CHECK constraint
    // guarantees both), but the type allows null and a commitment without a
    // window would lock nothing.
    if (!event.proposedStart || !event.proposedEnd) {
      throw new ConflictException('the event has no date and time to commit for');
    }

    return {
      ...event,
      proposedStart: event.proposedStart,
      proposedEnd: event.proposedEnd,
    };
  }

  /** Row-locks the item so concurrent commitments of it run one at a time. */
  private async lockEquipment(
    tx: Prisma.TransactionClient,
    equipmentId: string,
  ): Promise<void> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Equipment" WHERE "id" = ${equipmentId} FOR UPDATE`;

    if (locked.length === 0) {
      throw new NotFoundException('equipment not found');
    }
  }
}

/** US-32 AC-3 — why a commitment was refused, in terms the user can act on. */
export function rejectionReason(
  availability: ItemAvailability,
  window: { start: Date; end: Date },
): string {
  const period = `${window.start.toISOString()} – ${window.end.toISOString()}`;

  if (availability.unavailableQuantity > 0) {
    const condition =
      availability.operationalStatus === EquipmentStatus.UNDER_MAINTENANCE
        ? 'under maintenance'
        : 'damaged (out of service)';
    return `${availability.type} is ${condition}, so none of it can be committed.`;
  }

  return (
    `Only ${availability.availableQuantity} of the ${availability.requestedQuantity} ` +
    `${availability.type} requested are free for ${period}: ` +
    `${availability.reservedQuantity} of ${availability.totalQuantity} are already ` +
    `committed to an overlapping period.`
  );
}
