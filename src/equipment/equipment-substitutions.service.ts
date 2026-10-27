import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  EquipmentStatus,
  EventStatus,
  Prisma,
  SubstitutionStatus,
} from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { PrismaService } from '../prisma/prisma.service';
import { SuggestSubstitutionDto } from './dto/substitution-choice.dto';
import {
  computeItemAvailability,
  holdingReservationsWhere,
  isLendable,
  ReservationSlot,
} from './equipment-availability';
import { EquipmentNotifier, SubstitutionLine } from './equipment-notifier';
import { AFFECTED_RESERVATION_STATUSES } from './equipment-status';
import { EquipmentReservationsService } from './equipment-reservations.service';
import {
  acceptError,
  AffectedReservation,
  requiresSubstitution,
  SUBSTITUTION_SELECT,
  SubstitutionChoice,
  substitutionDecisionError,
  substitutionPlanError,
  SubstitutionView,
} from './equipment-substitution';

/** Limits for the transactions below; they may wait on an item's row lock. */
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;

/** The reservations a choice can be about: with the event they sit on. */
type ReservationOnEvent = AffectedReservation & {
  event: { id: string; status: EventStatus };
};

/** A substitution just recorded, with what the notice needs to name it. */
export interface RecordedSubstitution {
  reservationId: string;
  eventId: string;
  line: SubstitutionLine;
}

/** A replacement the dropdown offers for one reservation. */
export interface AlternativeCandidate {
  id: string;
  type: string;
  description: string | null;
  location: string | null;
  totalQuantity: number;
  /** Free for the whole reservation window — never less than the reservation. */
  availableQuantity: number;
  /** Same type as the item being replaced: listed first. */
  sameType: boolean;
}

/**
 * When equipment a CONFIRMED event depends on is taken out of service,
 * Technical Support must say what replaces it — or that nothing can — and the
 * Coordinator accepts or declines.
 *
 *   record   Technical Support, with the status change (all-or-nothing) or
 *            afterwards for an item that is already out of service
 *   accept   the Coordinator: the reservation moves to the alternative
 *   decline  the Coordinator: the problem is acknowledged, the reservation
 *            stays, the event goes on. Final — and the only answer to
 *            "no valid alternative".
 *
 * The only place EquipmentSubstitution.status is written
 * (events-status-audit.spec.ts enforces it).
 */
@Injectable()
export class EquipmentSubstitutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly reservations: EquipmentReservationsService,
    @Optional() private readonly notifier?: EquipmentNotifier,
  ) {}

  /**
   * The items Technical Support may offer for one reservation: in service,
   * not the item itself, and with the reservation's full quantity free for
   * its whole window (a substitute must match the original quantity).
   */
  async candidatesFor(
    user: AuthenticatedUser,
    reservationId: string,
  ): Promise<AlternativeCandidate[]> {
    this.access.requireScope(user, Resource.EQUIPMENT, Action.READ);

    const reservation = await this.prisma.equipmentReservation.findUnique({
      where: { id: reservationId },
      select: {
        quantity: true,
        start: true,
        end: true,
        equipmentId: true,
        equipment: { select: { type: true } },
      },
    });
    if (!reservation) throw new NotFoundException('reservation not found');

    const window = { start: reservation.start, end: reservation.end };
    const items = await this.prisma.equipment.findMany({
      where: {
        id: { not: reservation.equipmentId },
        operationalStatus: EquipmentStatus.OPERATIONAL,
      },
      select: {
        id: true,
        type: true,
        description: true,
        location: true,
        totalQuantity: true,
        operationalStatus: true,
      },
    });
    const held = await this.prisma.equipmentReservation.findMany({
      where: holdingReservationsWhere(
        items.map((i) => i.id),
        window,
      ),
      select: { equipmentId: true, quantity: true, start: true, end: true },
    });

    const candidates: AlternativeCandidate[] = [];
    for (const item of items) {
      const availability = computeItemAvailability({
        equipment: item,
        requestedQuantity: reservation.quantity,
        reservations: held.filter((h) => h.equipmentId === item.id),
        window,
      });
      if (!availability.fullyAvailable) continue;
      candidates.push({
        id: item.id,
        type: item.type,
        description: item.description,
        location: item.location,
        totalQuantity: item.totalQuantity,
        availableQuantity: availability.availableQuantity,
        sameType:
          item.type.toLowerCase() === reservation.equipment.type.toLowerCase(),
      });
    }

    return candidates.sort(
      (a, b) =>
        Number(b.sameType) - Number(a.sameType) ||
        a.type.localeCompare(b.type) ||
        a.id.localeCompare(b.id),
    );
  }

  /**
   * Inside EquipmentService.changeStatus's transaction: answer every
   * reservation of the item that sits on a CONFIRMED event. Throws — and so
   * rolls the status change back — when one is unanswered or an answer does
   * not hold (item out of service, short of units, or the item itself).
   */
  async recordForStatusChange(
    tx: Prisma.TransactionClient,
    suggestedById: string,
    item: { id: string },
    affected: readonly ReservationOnEvent[],
    choices: readonly SubstitutionChoice[],
  ): Promise<RecordedSubstitution[]> {
    const error = substitutionPlanError(affected, choices);
    if (error) throw new BadRequestException(error);
    return this.create(tx, suggestedById, item, affected, choices);
  }

  /**
   * The item went back into service: every substitution still open for its
   * reservations — waiting, or declined — is closed, since the problem they
   * answered is over. A later outage asks the question afresh. ACCEPTED ones
   * stay: that reservation already moved.
   */
  async voidForRestoredItem(
    tx: Prisma.TransactionClient,
    equipmentId: string,
  ): Promise<void> {
    await tx.equipmentSubstitution.updateMany({
      where: {
        reservation: { equipmentId },
        status: {
          in: [SubstitutionStatus.PENDING, SubstitutionStatus.DECLINED],
        },
      },
      data: { status: SubstitutionStatus.VOID },
    });
  }

  /**
   * Technical Support answers for a reservation after the status change — the
   * item was already out of service when the event reached CONFIRMED, or the
   * earlier answer was closed. Refused unless the reservation is live, its
   * item still out of use, its event CONFIRMED and it has no open answer.
   */
  async suggest(
    user: AuthenticatedUser,
    reservationId: string,
    dto: SuggestSubstitutionDto,
  ): Promise<SubstitutionView> {
    this.access.requireScope(user, Resource.EQUIPMENT, Action.UPDATE);

    const choice: SubstitutionChoice = { reservationId, ...dto };

    return this.prisma.$transaction(async (tx) => {
      const found = await tx.equipmentReservation.findUnique({
        where: { id: reservationId },
        select: { equipmentId: true },
      });
      if (!found) throw new NotFoundException('reservation not found');
      await this.lock(tx, 'Equipment', found.equipmentId);

      const reservation = await tx.equipmentReservation.findUniqueOrThrow({
        where: { id: reservationId },
        select: {
          id: true,
          quantity: true,
          start: true,
          end: true,
          status: true,
          equipment: {
            select: { id: true, type: true, operationalStatus: true },
          },
          event: {
            select: { id: true, name: true, status: true, coordinatorId: true },
          },
        },
      });

      if (
        !AFFECTED_RESERVATION_STATUSES.includes(reservation.status) ||
        reservation.end.getTime() <= Date.now()
      ) {
        throw new ConflictException('this reservation is no longer active');
      }
      if (isLendable(reservation.equipment.operationalStatus)) {
        throw new ConflictException(
          'this reservation’s item is in service; nothing to replace',
        );
      }
      if (!requiresSubstitution(reservation.event.status)) {
        throw new ConflictException(
          'an alternative is only needed once the event is confirmed',
        );
      }
      const open = await tx.equipmentSubstitution.findFirst({
        where: { reservationId, status: { not: SubstitutionStatus.VOID } },
        select: { status: true },
      });
      if (open) {
        throw new ConflictException(
          `this reservation already has a ${open.status.toLowerCase()} substitution`,
        );
      }

      const error = substitutionPlanError([reservation], [choice]);
      if (error) throw new BadRequestException(error);

      const [recorded] = await this.create(
        tx,
        user.userId,
        reservation.equipment,
        [reservation],
        [choice],
      );
      await this.notifier?.substituteSuggested(
        tx,
        reservation.event,
        recorded.line,
      );

      return tx.equipmentSubstitution.findFirstOrThrow({
        where: { reservationId, status: { not: SubstitutionStatus.VOID } },
        select: SUBSTITUTION_SELECT,
      });
    }, TRANSACTION_OPTIONS);
  }

  /**
   * The Coordinator accepts: the reservation is rebooked onto the
   * alternative — same event, same window, same quantity and status — and the
   * original is RELEASED, linked to its replacement (as US-48 does).
   *
   * Everything is re-checked under locks, since the proposal may be old: the
   * substitution is still pending, the event still CONFIRMED, the reservation
   * still live, the original item still out of use, and the alternative still
   * in service with the full quantity free. A failed check is a 409 and the
   * substitution stays PENDING, so the Coordinator can still decline.
   */
  async accept(
    user: AuthenticatedUser,
    substitutionId: string,
  ): Promise<SubstitutionView> {
    this.access.requireScope(user, Resource.RESERVATION, Action.DECIDE);
    const target = await this.findOwned(user, substitutionId);
    const refusal = acceptError(target.alternativeEquipmentId);
    if (refusal) throw new ConflictException(refusal);

    return this.prisma.$transaction(async (tx) => {
      // Same lock order as a status change: the original item, then the rest.
      await this.lock(tx, 'Equipment', target.reservation.equipmentId);
      await this.lock(tx, 'Equipment', target.alternativeEquipmentId!);
      await this.lock(tx, 'EquipmentSubstitution', substitutionId);

      const fresh = await tx.equipmentSubstitution.findUniqueOrThrow({
        where: { id: substitutionId },
        select: {
          status: true,
          suggestedById: true,
          reservation: {
            select: {
              id: true,
              quantity: true,
              start: true,
              end: true,
              status: true,
              equipment: {
                select: { id: true, type: true, operationalStatus: true },
              },
              event: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                  technicalSupportId: true,
                },
              },
            },
          },
          alternativeEquipment: {
            select: {
              id: true,
              type: true,
              totalQuantity: true,
              operationalStatus: true,
            },
          },
        },
      });

      const decided = substitutionDecisionError(fresh.status, 'accept');
      if (decided) throw new ConflictException(decided);

      const { reservation, alternativeEquipment: alternative } = fresh;
      if (!alternative) throw new ConflictException(acceptError(null)!);

      if (!requiresSubstitution(reservation.event.status)) {
        throw new ConflictException(
          `the event is ${reservation.event.status}, not confirmed any more; decline to acknowledge`,
        );
      }
      if (
        !AFFECTED_RESERVATION_STATUSES.includes(reservation.status) ||
        reservation.end.getTime() <= Date.now()
      ) {
        throw new ConflictException(
          'the reservation is no longer active; decline to acknowledge',
        );
      }
      if (isLendable(reservation.equipment.operationalStatus)) {
        throw new ConflictException(
          'the original item is back in service; there is nothing to replace',
        );
      }

      const window = { start: reservation.start, end: reservation.end };
      const availability = computeItemAvailability({
        equipment: alternative,
        requestedQuantity: reservation.quantity,
        reservations: await tx.equipmentReservation.findMany({
          where: holdingReservationsWhere([alternative.id], window),
          select: { quantity: true, start: true, end: true },
        }),
        window,
      });
      if (!availability.fullyAvailable) {
        throw new ConflictException(
          isLendable(alternative.operationalStatus)
            ? `"${alternative.type}" no longer has ${reservation.quantity} free for this event ` +
                `(${availability.availableQuantity} free); decline to acknowledge`
            : `"${alternative.type}" is no longer in service; decline to acknowledge`,
        );
      }

      const created = await this.reservations.rebookOntoItem(
        tx,
        {
          id: reservation.id,
          eventId: reservation.event.id,
          quantity: reservation.quantity,
          start: reservation.start,
          end: reservation.end,
          status: reservation.status,
        },
        alternative.id,
      );
      await this.repointRequirement(
        tx,
        reservation.event.id,
        { id: reservation.equipment.id, type: reservation.equipment.type },
        { id: alternative.id, type: alternative.type },
        reservation.quantity,
      );
      await tx.equipmentSubstitution.update({
        where: { id: substitutionId },
        data: {
          status: SubstitutionStatus.ACCEPTED,
          decidedById: user.userId,
          decidedAt: new Date(),
          resultReservationId: created.id,
        },
      });

      await this.tellTechnicalSupport(
        tx,
        user,
        fresh.suggestedById,
        reservation.event,
        {
          quantity: reservation.quantity,
          originalType: reservation.equipment.type,
          alternativeType: alternative.type,
        },
        true,
      );

      return tx.equipmentSubstitution.findUniqueOrThrow({
        where: { id: substitutionId },
        select: SUBSTITUTION_SELECT,
      });
    }, TRANSACTION_OPTIONS);
  }

  /**
   * The Coordinator declines — acknowledging the equipment problem. The
   * original reservation stays and the event goes on; the equipment flag
   * stays with the Coordinator. Final: Technical Support cannot propose again
   * for this reservation. The only answer to "no valid alternative".
   */
  async decline(
    user: AuthenticatedUser,
    substitutionId: string,
  ): Promise<SubstitutionView> {
    this.access.requireScope(user, Resource.RESERVATION, Action.DECIDE);
    await this.findOwned(user, substitutionId);

    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, 'EquipmentSubstitution', substitutionId);

      const fresh = await tx.equipmentSubstitution.findUniqueOrThrow({
        where: { id: substitutionId },
        select: {
          status: true,
          suggestedById: true,
          alternativeEquipment: { select: { type: true } },
          reservation: {
            select: {
              quantity: true,
              equipment: { select: { type: true } },
              event: {
                select: { id: true, name: true, technicalSupportId: true },
              },
            },
          },
        },
      });

      const decided = substitutionDecisionError(fresh.status, 'decline');
      if (decided) throw new ConflictException(decided);

      await tx.equipmentSubstitution.update({
        where: { id: substitutionId },
        data: {
          status: SubstitutionStatus.DECLINED,
          decidedById: user.userId,
          decidedAt: new Date(),
        },
      });

      await this.tellTechnicalSupport(
        tx,
        user,
        fresh.suggestedById,
        fresh.reservation.event,
        {
          quantity: fresh.reservation.quantity,
          originalType: fresh.reservation.equipment.type,
          alternativeType: fresh.alternativeEquipment?.type ?? null,
        },
        false,
      );

      return tx.equipmentSubstitution.findUniqueOrThrow({
        where: { id: substitutionId },
        select: SUBSTITUTION_SELECT,
      });
    }, TRANSACTION_OPTIONS);
  }

  /** The substitution if it is on this Coordinator's own event; otherwise "not found". */
  private async findOwned(user: AuthenticatedUser, substitutionId: string) {
    const found = await this.prisma.equipmentSubstitution.findFirst({
      where: {
        id: substitutionId,
        reservation: { event: { coordinatorId: user.userId } },
      },
      select: {
        alternativeEquipmentId: true,
        reservation: { select: { equipmentId: true } },
      },
    });
    if (!found) throw new NotFoundException('substitution not found');
    return found;
  }

  /**
   * Writes the substitutions for already-validated choices, checking each
   * alternative as it goes. Units a choice takes count against the next, so
   * two reservations cannot both claim the last free unit of one item.
   */
  private async create(
    tx: Prisma.TransactionClient,
    suggestedById: string,
    item: { id: string },
    affected: readonly ReservationOnEvent[],
    choices: readonly SubstitutionChoice[],
  ): Promise<RecordedSubstitution[]> {
    if (choices.length === 0) return [];

    const byId = new Map(affected.map((r) => [r.id, r]));
    const wanted = [
      ...new Set(
        choices
          .map((c) => c.alternativeEquipmentId)
          .filter((id): id is string => !!id),
      ),
    ].sort();
    // Sorted, so two outages offering each other's items lock in one order.
    for (const id of wanted) await this.lock(tx, 'Equipment', id);

    const alternatives = new Map(
      (
        await tx.equipment.findMany({
          where: { id: { in: wanted } },
          select: {
            id: true,
            type: true,
            totalQuantity: true,
            operationalStatus: true,
          },
        })
      ).map((e) => [e.id, e]),
    );
    const original = await tx.equipment.findUniqueOrThrow({
      where: { id: item.id },
      select: { type: true },
    });

    const claimed: (ReservationSlot & { equipmentId: string })[] = [];
    const recorded: RecordedSubstitution[] = [];

    for (const choice of choices) {
      const reservation = byId.get(choice.reservationId)!;
      const alternative = choice.alternativeEquipmentId
        ? alternatives.get(choice.alternativeEquipmentId)
        : undefined;

      if (choice.alternativeEquipmentId) {
        if (!alternative) {
          throw new BadRequestException(
            `alternative ${choice.alternativeEquipmentId} not found`,
          );
        }
        if (alternative.id === item.id) {
          throw new BadRequestException(
            'an item cannot be its own alternative',
          );
        }
        if (!isLendable(alternative.operationalStatus)) {
          throw new ConflictException(
            `"${alternative.type}" is not in service, so it cannot replace this item`,
          );
        }
        const window = { start: reservation.start, end: reservation.end };
        const held = await tx.equipmentReservation.findMany({
          where: holdingReservationsWhere([alternative.id], window),
          select: { quantity: true, start: true, end: true },
        });
        const availability = computeItemAvailability({
          equipment: alternative,
          requestedQuantity: reservation.quantity,
          reservations: [
            ...held,
            ...claimed.filter((c) => c.equipmentId === alternative.id),
          ],
          window,
        });
        if (!availability.fullyAvailable) {
          throw new ConflictException(
            `"${alternative.type}" has ${availability.availableQuantity} free for that event; ` +
              `${reservation.quantity} are needed (a replacement must match the original quantity)`,
          );
        }
        claimed.push({
          equipmentId: alternative.id,
          quantity: reservation.quantity,
          start: reservation.start,
          end: reservation.end,
        });
      }

      await tx.equipmentSubstitution.create({
        data: {
          reservationId: reservation.id,
          alternativeEquipmentId: alternative?.id ?? null,
          suggestedById,
        },
      });
      recorded.push({
        reservationId: reservation.id,
        eventId: reservation.event.id,
        line: {
          quantity: reservation.quantity,
          originalType: original.type,
          alternativeType: alternative?.type ?? null,
        },
      });
    }

    return recorded;
  }

  /**
   * The event's "required equipment" must name what is now reserved: the
   * confirmation-readiness check matches a requirement line to the event's
   * reservations by item, so a line still naming the broken item would read
   * as "not reserved". A line of exactly the swapped quantity is repointed;
   * a larger one is split, the swapped part moving to the alternative. A note
   * records the swap. With no matching line (or only smaller ones, which
   * several reservations cover together) nothing is guessed.
   */
  private async repointRequirement(
    tx: Prisma.TransactionClient,
    eventId: string,
    original: { id: string; type: string },
    alternative: { id: string; type: string },
    quantity: number,
  ): Promise<void> {
    const lines = await tx.equipmentRequirement.findMany({
      where: { eventId, equipmentId: original.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const exact = lines.find((l) => l.quantity === quantity);
    const larger = lines.find((l) => l.quantity > quantity);
    const line = exact ?? larger;
    if (!line) return;

    const swapped = `Replaced ${original.type}, which went out of service.`;
    const notes = line.notes ? `${line.notes} ${swapped}` : swapped;

    if (exact) {
      await tx.equipmentRequirement.update({
        where: { id: exact.id },
        data: {
          equipmentId: alternative.id,
          equipmentType: alternative.type,
          notes,
        },
      });
      return;
    }

    await tx.equipmentRequirement.update({
      where: { id: line.id },
      data: { quantity: line.quantity - quantity },
    });
    await tx.equipmentRequirement.create({
      data: {
        eventId,
        equipmentId: alternative.id,
        equipmentType: alternative.type,
        quantity,
        notes: swapped,
      },
    });
  }

  /** Tells the proposer and the event's assigned Technical Support member. */
  private async tellTechnicalSupport(
    tx: Prisma.TransactionClient,
    coordinator: AuthenticatedUser,
    suggestedById: string,
    event: {
      id: string;
      name: string | null;
      technicalSupportId: string | null;
    },
    line: SubstitutionLine,
    accepted: boolean,
  ): Promise<void> {
    const coordinatorRow = await tx.user.findUnique({
      where: { id: coordinator.userId },
      select: { name: true },
    });
    await this.notifier?.substituteDecided(tx, {
      recipientIds: [suggestedById, event.technicalSupportId].filter(
        (id): id is string => !!id,
      ),
      event,
      line,
      accepted,
      coordinatorName: coordinatorRow?.name ?? 'The Event Coordinator',
    });
  }

  private async lock(
    tx: Prisma.TransactionClient,
    table: 'Equipment' | 'EquipmentSubstitution',
    id: string,
  ): Promise<void> {
    const rows =
      table === 'Equipment'
        ? await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "Equipment" WHERE "id" = ${id} FOR UPDATE`
        : await tx.$queryRaw<{ id: string }[]>`
            SELECT "id" FROM "EquipmentSubstitution" WHERE "id" = ${id} FOR UPDATE`;
    if (rows.length === 0)
      throw new NotFoundException(`${table.toLowerCase()} not found`);
  }
}
