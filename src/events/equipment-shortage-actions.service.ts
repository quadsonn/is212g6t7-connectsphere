import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  EquipmentSuggestionStatus,
  EventStatus,
  NotificationType,
  Prisma,
  ReservationStatus,
} from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { ArrangementsRegistry } from '../common/arrangements/arrangements.registry';
import {
  AVAILABILITY_EQUIPMENT_SELECT,
  computeItemAvailability,
  holdingReservationsWhere,
} from '../equipment/equipment-availability';
import { EquipmentNotifier } from '../equipment/equipment-notifier';
import {
  EquipmentReservationsService,
  RELEASABLE_STATUSES,
} from '../equipment/equipment-reservations.service';
import {
  EquipmentShortageService,
  EventReservationShortage,
} from '../equipment/equipment-shortage.service';
import { loadShortages } from '../equipment/equipment-shortage';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReduceReservationDto,
  ReleaseReservationDto,
  SuggestAlternativeDto,
} from './dto/equipment-shortage.dto';
import { FieldChange } from './event-change.rules';
import { EventsService } from './events.service';

/** Same limits as a US-31 commit: these wait on the same equipment row locks. */
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;

const RESERVATION_SELECT = {
  id: true,
  eventId: true,
  equipmentId: true,
  quantity: true,
  start: true,
  end: true,
  status: true,
  equipment: { select: { type: true } },
  event: {
    select: { id: true, name: true, status: true, coordinatorId: true, technicalSupportId: true },
  },
} as const satisfies Prisma.EquipmentReservationSelect;

type LockedReservation = Prisma.EquipmentReservationGetPayload<{ select: typeof RESERVATION_SELECT }>;

/** An item free in the needed quantity for a short reservation's period. */
export interface AlternativeItem {
  equipmentId: string;
  type: string;
  location: string | null;
  availableQuantity: number;
}

/** What a reduction, release or acceptance leaves behind. */
export interface AdjustmentResult {
  reservationId: string;
  /** 0 once released. */
  quantity: number;
  status: ReservationStatus;
}

const units = (quantity: number, type: string) => `${quantity} × ${type}`;

/**
 * US-45 — resolving an equipment shortage by hand, never automatically.
 *
 * When damaged or under-maintenance units leave too few working units for the
 * upcoming reservations, nobody is chosen to lose out. Instead:
 *   - Technical Support reduce a reservation, or release it, with a reason;
 *   - for an event already CONFIRMED, Technical Support suggest an alternative
 *     item, which the event's Coordinator accepts or declines.
 * Each change is recorded in the event's history and the other party is told.
 *
 * Every write runs under the equipment row lock (FOR UPDATE) a US-31 commit
 * and a US-45 status change take, so counts read here cannot be overtaken.
 */
@Injectable()
export class EquipmentShortageActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly events: EventsService,
    private readonly reservations: EquipmentReservationsService,
    private readonly shortages: EquipmentShortageService,
    private readonly notifier: EquipmentNotifier,
    private readonly notifications: NotificationsService,
    // A reduction or release may mean the event no longer has what it needs.
    @Optional() private readonly arrangements?: ArrangementsRegistry,
  ) {}

  /** Technical Support's view of one event's reservations, with shortages. */
  async listForEvent(user: AuthenticatedUser, eventId: string): Promise<EventReservationShortage[]> {
    this.access.requireScope(user, Resource.RESERVATION, Action.READ);
    const event = await this.prisma.eventRequest.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) throw new NotFoundException('event request not found');
    return this.shortages.findEventReservations(eventId);
  }

  /**
   * Reduce a reservation to `quantity` units (fewer than it holds), with a
   * required reason. Recorded in the event's history; the Coordinator is told.
   */
  async reduce(
    user: AuthenticatedUser,
    reservationId: string,
    dto: ReduceReservationDto,
  ): Promise<AdjustmentResult> {
    this.access.requireScope(user, Resource.RESERVATION, Action.UPDATE);

    const result = await this.prisma.$transaction(async (tx) => {
      const r = await this.lockLiveReservation(tx, reservationId);
      if (dto.quantity >= r.quantity) {
        throw new BadRequestException([
          `quantity must be fewer than the ${r.quantity} reserved; to give them all back, release the reservation`,
        ]);
      }

      await tx.equipmentReservation.update({ where: { id: r.id }, data: { quantity: dto.quantity } });
      await this.invalidateSuggestions(tx, r.id, dto.quantity);

      await this.record(tx, r, user, [units(r.quantity, r.equipment.type)], [units(dto.quantity, r.equipment.type)], dto.reason);
      await this.notifier.reservationAdjusted(
        tx,
        this.notifiable(r),
        `Technical Support reduced ${r.equipment.type} for your event "${r.event.name ?? 'an event'}" ` +
          `from ${r.quantity} to ${dto.quantity}. Reason: ${dto.reason}`,
      );

      return { reservationId: r.id, quantity: dto.quantity, status: r.status, eventId: r.eventId };
    }, TRANSACTION_OPTIONS);

    await this.arrangements?.notifyChanged(result.eventId);
    return { reservationId: result.reservationId, quantity: result.quantity, status: result.status };
  }

  /**
   * Release a reservation entirely, with a required reason. Recorded in the
   * event's history; the Coordinator is told. The released record is kept.
   */
  async release(
    user: AuthenticatedUser,
    reservationId: string,
    dto: ReleaseReservationDto,
  ): Promise<AdjustmentResult> {
    this.access.requireScope(user, Resource.RESERVATION, Action.UPDATE);

    const eventId = await this.prisma.$transaction(async (tx) => {
      const r = await this.lockLiveReservation(tx, reservationId);

      await this.reservations.releaseOne(tx, r.id);
      await this.invalidateSuggestions(tx, r.id, 0);

      await this.record(tx, r, user, [units(r.quantity, r.equipment.type)], [`${r.equipment.type}: released`], dto.reason);
      await this.notifier.reservationAdjusted(
        tx,
        this.notifiable(r),
        `Technical Support released the ${units(r.quantity, r.equipment.type)} reserved for your event ` +
          `"${r.event.name ?? 'an event'}". Reason: ${dto.reason}`,
      );
      return r.eventId;
    }, TRANSACTION_OPTIONS);

    await this.arrangements?.notifyChanged(eventId);
    return { reservationId, quantity: 0, status: ReservationStatus.RELEASED };
  }

  /**
   * The items Technical Support may suggest for a short reservation: every
   * other item with at least `quantity` units free for its period.
   */
  async alternatives(
    user: AuthenticatedUser,
    reservationId: string,
    quantity: number,
  ): Promise<AlternativeItem[]> {
    this.access.requireScope(user, Resource.RESERVATION, Action.READ);

    const r = await this.prisma.equipmentReservation.findUnique({
      where: { id: reservationId },
      select: RESERVATION_SELECT,
    });
    if (!r) throw new NotFoundException('reservation not found');

    const window = { start: r.start, end: r.end };
    const [items, held] = await Promise.all([
      this.prisma.equipment.findMany({
        where: { id: { not: r.equipmentId } },
        select: { ...AVAILABILITY_EQUIPMENT_SELECT, location: true },
        orderBy: { type: 'asc' },
      }),
      this.prisma.equipmentReservation.findMany({
        where: { ...holdingReservationsWhere([], window), equipmentId: { not: r.equipmentId } },
        select: { equipmentId: true, quantity: true, start: true, end: true },
      }),
    ]);

    return items
      .map((item) => ({
        item,
        free: computeItemAvailability({
          equipment: item,
          requestedQuantity: quantity,
          reservations: held.filter((h) => h.equipmentId === item.id),
          window,
        }).availableQuantity,
      }))
      .filter(({ free }) => free >= quantity)
      .map(({ item, free }) => ({
        equipmentId: item.id,
        type: item.type,
        location: item.location,
        availableQuantity: free,
      }));
  }

  /**
   * For a CONFIRMED event whose reservation is short, suggest `quantity` units
   * of another item, available in that quantity for the reservation's period,
   * with a reason. One open suggestion per reservation. The Coordinator is told.
   */
  async suggest(
    user: AuthenticatedUser,
    reservationId: string,
    dto: SuggestAlternativeDto,
  ) {
    this.access.requireScope(user, Resource.RESERVATION, Action.UPDATE);

    return this.prisma.$transaction(async (tx) => {
      const r = await this.lockLiveReservation(tx, reservationId, dto.alternativeEquipmentId);

      if (r.event.status !== EventStatus.CONFIRMED) {
        throw new ConflictException(
          'an alternative is suggested only for a confirmed event; for this one, reserve the other item directly',
        );
      }
      if (r.status !== ReservationStatus.APPROVED || !((await loadShortages(tx, [r.equipmentId])).get(r.id))) {
        throw new ConflictException('this reservation is not short, so there is nothing to suggest an alternative for');
      }
      if (dto.alternativeEquipmentId === r.equipmentId) {
        throw new BadRequestException(['the alternative must be a different equipment item']);
      }
      if (dto.quantity > r.quantity) {
        throw new BadRequestException([`quantity must be at most the ${r.quantity} reserved`]);
      }

      const open = await tx.equipmentSuggestion.findFirst({
        where: { reservationId: r.id, status: EquipmentSuggestionStatus.OPEN },
        select: { id: true },
      });
      if (open) {
        throw new ConflictException(`this reservation already has an open suggestion (${open.id})`);
      }

      const alternative = await this.freeUnitsOf(tx, dto.alternativeEquipmentId, r, dto.quantity);
      if (alternative.availableQuantity < dto.quantity) {
        throw new ConflictException(
          `only ${alternative.availableQuantity} ${alternative.type} are free for the event's date and time`,
        );
      }

      const suggestion = await tx.equipmentSuggestion.create({
        data: {
          reservationId: r.id,
          alternativeEquipmentId: dto.alternativeEquipmentId,
          quantity: dto.quantity,
          reason: dto.reason,
          suggestedById: user.userId,
        },
      });

      await this.notifier.alternativeSuggested(
        tx,
        this.notifiable(r),
        `Technical Support suggest ${units(dto.quantity, alternative.type)} in place of ` +
          `${units(dto.quantity, r.equipment.type)} for your event "${r.event.name ?? 'an event'}". ` +
          `Reason: ${dto.reason}`,
      );

      return suggestion;
    }, TRANSACTION_OPTIONS);
  }

  /**
   * The Coordinator accepts: in one transaction, `quantity` units of the
   * alternative are reserved for the reservation's period and the same number
   * taken off the short reservation (released if none are left). Recorded in
   * the history; Technical Support are told.
   *
   * If the alternative no longer has the units free, or the reservation no
   * longer holds them, the suggestion becomes INVALID and nothing else
   * changes (409).
   */
  async accept(user: AuthenticatedUser, suggestionId: string) {
    const suggestion = await this.findDecidable(user, suggestionId);

    const outcome = await this.prisma.$transaction(async (tx) => {
      // Both items, in a fixed order, so two acceptances cannot deadlock.
      for (const id of [suggestion.reservation.equipmentId, suggestion.alternativeEquipmentId].sort()) {
        await this.reservations.lockEquipment(tx, id);
      }

      // The suggestion row too, so a decline cannot land between this check
      // and the acceptance below: whichever comes second sees it decided.
      const [s] = await tx.$queryRaw<{ status: EquipmentSuggestionStatus }[]>`
        SELECT "status" FROM "EquipmentSuggestion" WHERE "id" = ${suggestionId} FOR UPDATE`;
      if (s.status !== EquipmentSuggestionStatus.OPEN) {
        throw new ConflictException(`this suggestion is already ${s.status.toLowerCase()}`);
      }

      const r = await tx.equipmentReservation.findUniqueOrThrow({
        where: { id: suggestion.reservationId },
        select: RESERVATION_SELECT,
      });

      const reasonInvalid =
        !RELEASABLE_STATUSES.includes(r.status) || r.end <= new Date()
          ? 'the short reservation no longer holds any units'
          : r.quantity < suggestion.quantity
            ? `the short reservation now holds only ${r.quantity}`
            : null;
      const alternative = await this.freeUnitsOf(tx, suggestion.alternativeEquipmentId, r, suggestion.quantity);
      const invalid =
        reasonInvalid ??
        (alternative.availableQuantity < suggestion.quantity
          ? `only ${alternative.availableQuantity} ${alternative.type} are free now`
          : null);

      if (invalid) {
        await tx.equipmentSuggestion.update({
          where: { id: suggestionId },
          data: { status: EquipmentSuggestionStatus.INVALID, decidedById: user.userId, decidedAt: new Date() },
        });
        return { invalid };
      }

      const replacement = await this.reservations.createCommitted(tx, {
        eventId: r.eventId,
        equipmentId: suggestion.alternativeEquipmentId,
        quantity: suggestion.quantity,
        start: r.start,
        end: r.end,
      });

      const left = r.quantity - suggestion.quantity;
      if (left > 0) {
        await tx.equipmentReservation.update({ where: { id: r.id }, data: { quantity: left } });
      } else {
        await this.reservations.releaseOne(tx, r.id);
      }

      await tx.equipmentSuggestion.update({
        where: { id: suggestionId },
        data: { status: EquipmentSuggestionStatus.ACCEPTED, decidedById: user.userId, decidedAt: new Date() },
      });

      await this.record(
        tx,
        r,
        user,
        [units(r.quantity, r.equipment.type)],
        [
          ...(left > 0 ? [units(left, r.equipment.type)] : []),
          units(suggestion.quantity, alternative.type),
        ],
        `Alternative accepted: ${suggestion.reason}`,
      );
      await this.toTechnicalSupport(
        tx,
        suggestion,
        r,
        `The Coordinator accepted ${units(suggestion.quantity, alternative.type)} in place of ` +
          `${units(suggestion.quantity, r.equipment.type)} for "${r.event.name ?? 'an event'}"; it is reserved.`,
      );

      return { invalid: null, replacementId: replacement.id, left };
    }, TRANSACTION_OPTIONS);

    if (outcome.invalid) {
      throw new ConflictException(`This suggestion is no longer valid: ${outcome.invalid}.`);
    }

    await this.arrangements?.notifyChanged(suggestion.reservation.eventId);
    return {
      suggestionId,
      status: EquipmentSuggestionStatus.ACCEPTED,
      replacementReservationId: outcome.replacementId,
      remainingQuantity: outcome.left,
    };
  }

  /** The Coordinator declines: the original reservation stays as it is. */
  async decline(user: AuthenticatedUser, suggestionId: string) {
    const suggestion = await this.findDecidable(user, suggestionId);

    await this.prisma.$transaction(async (tx) => {
      // Conditional on OPEN, so a concurrent accept and decline cannot both win.
      const { count } = await tx.equipmentSuggestion.updateMany({
        where: { id: suggestionId, status: EquipmentSuggestionStatus.OPEN },
        data: { status: EquipmentSuggestionStatus.DECLINED, decidedById: user.userId, decidedAt: new Date() },
      });
      if (count === 0) {
        throw new ConflictException('this suggestion has already been decided');
      }

      await this.toTechnicalSupport(
        tx,
        suggestion,
        suggestion.reservation,
        `The Coordinator declined ${units(suggestion.quantity, suggestion.alternativeEquipment.type)} for ` +
          `"${suggestion.reservation.event.name ?? 'an event'}"; the original reservation is unchanged.`,
      );
    });

    return { suggestionId, status: EquipmentSuggestionStatus.DECLINED };
  }

  // --- helpers ---------------------------------------------------------------

  /**
   * Locks the reservation's item (and `alsoLock`, in id order) and returns the
   * reservation if it still holds units for a period not yet over.
   */
  private async lockLiveReservation(
    tx: Prisma.TransactionClient,
    reservationId: string,
    alsoLock?: string,
  ): Promise<LockedReservation> {
    const found = await tx.equipmentReservation.findUnique({
      where: { id: reservationId },
      select: { equipmentId: true },
    });
    if (!found) throw new NotFoundException('reservation not found');

    const ids = [...new Set([found.equipmentId, ...(alsoLock ? [alsoLock] : [])])].sort();
    for (const id of ids) await this.reservations.lockEquipment(tx, id);

    const r = await tx.equipmentReservation.findUniqueOrThrow({
      where: { id: reservationId },
      select: RESERVATION_SELECT,
    });
    if (!RELEASABLE_STATUSES.includes(r.status)) {
      throw new ConflictException('this reservation no longer holds any units');
    }
    if (r.end <= new Date()) {
      throw new ConflictException('this reservation is already over');
    }
    return r;
  }

  /** Free units of `equipmentId` for the reservation's period, under the caller's lock. */
  private async freeUnitsOf(
    tx: Prisma.TransactionClient,
    equipmentId: string,
    r: LockedReservation,
    quantity: number,
  ) {
    const window = { start: r.start, end: r.end };
    const [equipment, held] = await Promise.all([
      tx.equipment.findUnique({ where: { id: equipmentId }, select: AVAILABILITY_EQUIPMENT_SELECT }),
      tx.equipmentReservation.findMany({
        where: holdingReservationsWhere([equipmentId], window),
        select: { quantity: true, start: true, end: true },
      }),
    ]);
    if (!equipment) throw new NotFoundException('alternative equipment not found');
    return computeItemAvailability({ equipment, requestedQuantity: quantity, reservations: held, window });
  }

  /** A suggestion the caller may decide: theirs to coordinate, and found. */
  private async findDecidable(user: AuthenticatedUser, suggestionId: string) {
    this.access.requireScope(user, Resource.RESERVATION, Action.DECIDE);

    const suggestion = await this.prisma.equipmentSuggestion.findUnique({
      where: { id: suggestionId },
      include: {
        alternativeEquipment: { select: { type: true } },
        reservation: { select: RESERVATION_SELECT },
      },
    });
    // 404 rather than 403 for someone else's event, as assertEventAccess does.
    if (!suggestion || suggestion.reservation.event.coordinatorId !== user.userId) {
      throw new NotFoundException('suggestion not found');
    }
    return suggestion;
  }

  /** Closes open suggestions the reservation can no longer honour. */
  private async invalidateSuggestions(tx: Prisma.TransactionClient, reservationId: string, quantityLeft: number) {
    await tx.equipmentSuggestion.updateMany({
      where: { reservationId, status: EquipmentSuggestionStatus.OPEN, quantity: { gt: quantityLeft } },
      data: { status: EquipmentSuggestionStatus.INVALID, decidedAt: new Date() },
    });
  }

  private record(
    tx: Prisma.TransactionClient,
    r: LockedReservation,
    user: AuthenticatedUser,
    previous: string[],
    next: string[],
    reason: string,
  ) {
    const changes: FieldChange[] = [
      { field: 'equipmentReservations', previous, next },
      { field: 'equipmentReservationReason', previous: null, next: reason },
    ];
    return this.events.recordChange(tx, r.eventId, user.userId, changes, []);
  }

  private notifiable(r: LockedReservation) {
    return { id: r.event.id, name: r.event.name, coordinatorId: r.event.coordinatorId };
  }

  /** The member who suggested it, and the event's assigned member if another. */
  private async toTechnicalSupport(
    tx: Prisma.TransactionClient,
    suggestion: { suggestedById: string },
    r: Pick<LockedReservation, 'event'>,
    message: string,
  ) {
    const recipients = new Set([suggestion.suggestedById]);
    if (r.event.technicalSupportId) recipients.add(r.event.technicalSupportId);
    for (const recipientId of recipients) {
      await this.notifications.notify(
        {
          recipientId,
          type: NotificationType.EQUIPMENT_ALTERNATIVE_DECIDED,
          message,
          relatedEventId: r.event.id,
        },
        tx,
      );
    }
  }
}
