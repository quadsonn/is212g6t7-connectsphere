import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { EquipmentNotifier } from './equipment-notifier';
import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { compareReadableIds, inEntryOrder } from '../prisma/readable-id';
import { BrowseEquipmentDto, EquipmentSortField, SortOrder } from './dto/browse-equipment.dto';
import {
  ChangeEquipmentStatusDto,
  ProposedStatusMoveDto,
} from './dto/change-equipment-status.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import {
  AVAILABILITY_EQUIPMENT_SELECT,
  computeItemAvailability,
  holdingReservationsWhere,
  ItemAvailability,
  workingQuantity,
} from './equipment-availability';
import {
  LATEST_SUGGESTION_SELECT,
  latestAnswer,
  loadShortages,
  NoAlternativeNote,
  OpenSuggestion,
} from './equipment-shortage';
import {
  applyStatusMove,
  statusMoveError,
  unitsIn,
  upcomingReservationsWhere,
} from './equipment-status';
import { EquipmentStatusNotifier } from './equipment-status-notifier';

/**
 * US-29 AC-1 — the four fields a catalogue row shows at a glance.
 *
 * The briefing defines an equipment item by type, description, quantity,
 * location and operational status, so responses are built from those fields
 * only. The legacy `technicalSpecs` column (CLAUDE.md §5's first pass) is
 * deliberately never selected.
 */
export const EQUIPMENT_LIST_SELECT = {
  id: true,
  type: true,
  description: true,
  totalQuantity: true,
  location: true,
} as const satisfies Prisma.EquipmentSelect;

/** US-29 AC-2 — the full detail: the list fields plus operational status. */
export const EQUIPMENT_DETAIL_SELECT = {
  ...EQUIPMENT_LIST_SELECT,
  operationalStatus: true,
} as const satisfies Prisma.EquipmentSelect;

/** US-45 AC-2 — a recorded status change, with its reason and who made it. */
export const STATUS_CHANGE_SELECT = {
  id: true,
  fromStatus: true,
  toStatus: true,
  reason: true,
  changedAt: true,
  changedBy: { select: { id: true, name: true } },
} as const satisfies Prisma.EquipmentStatusChangeSelect;

/** US-45 AC-5 — an upcoming committed reservation of an item, and its event. */
export const UPCOMING_RESERVATION_SELECT = {
  id: true,
  quantity: true,
  start: true,
  end: true,
  status: true,
  event: {
    select: {
      id: true,
      name: true,
      status: true,
      coordinator: { select: { id: true, name: true } },
    },
  },
  // US-45: Technical Support's latest answer: an open suggestion, or none valid.
  suggestions: LATEST_SUGGESTION_SELECT,
} as const satisfies Prisma.EquipmentReservationSelect;

export type EquipmentListItem = Prisma.EquipmentGetPayload<{
  select: typeof EQUIPMENT_LIST_SELECT;
}>;
export type StatusChangeRecord = Prisma.EquipmentStatusChangeGetPayload<{
  select: typeof STATUS_CHANGE_SELECT;
}>;

/**
 * US-45 AC-2 — one entry of an item's status history: how many units moved,
 * from and to which status, the reason, who and when.
 */
export const STATUS_HISTORY_SELECT = {
  ...STATUS_CHANGE_SELECT,
  quantity: true,
} as const satisfies Prisma.EquipmentStatusChangeSelect;

export type StatusHistoryEntry = Prisma.EquipmentStatusChangeGetPayload<{
  select: typeof STATUS_HISTORY_SELECT;
}>;
type UpcomingReservationRow = Prisma.EquipmentReservationGetPayload<{
  select: typeof UPCOMING_RESERVATION_SELECT;
}>;

/**
 * US-45 — an upcoming reservation with its shortage: `shortBy` now, and
 * `shortByAfter` under a proposed change (the warning before saving).
 */
export type UpcomingReservation = Omit<UpcomingReservationRow, 'suggestions'> & {
  shortBy: number;
  shortByAfter: number;
  openSuggestion: OpenSuggestion | null;
  noAlternative: NoAlternativeNote | null;
};

/** US-45 — an item's units by condition: "8 available, 2 damaged, 0 under maintenance". */
export interface EquipmentCondition {
  equipmentId: string;
  totalQuantity: number;
  workingQuantity: number;
  damagedQuantity: number;
  maintenanceQuantity: number;
}

const CONDITION_SELECT = {
  id: true,
  totalQuantity: true,
  damagedQuantity: true,
  maintenanceQuantity: true,
} as const satisfies Prisma.EquipmentSelect;

function toCondition(item: Prisma.EquipmentGetPayload<{ select: typeof CONDITION_SELECT }>): EquipmentCondition {
  return {
    equipmentId: item.id,
    totalQuantity: item.totalQuantity,
    workingQuantity: workingQuantity(item),
    damagedQuantity: item.damagedQuantity,
    maintenanceQuantity: item.maintenanceQuantity,
  };
}

/**
 * US-29 AC-2 — the full detail. US-45 adds the most recent status change, so
 * the reason units are damaged or under maintenance is shown with it; null
 * for an item whose status has never been changed.
 */
export type EquipmentDetail = Prisma.EquipmentGetPayload<{
  select: typeof EQUIPMENT_DETAIL_SELECT;
}> & { latestStatusChange: StatusChangeRecord | null };

/** US-45 — what a status change returns. */
export interface StatusChangeResult {
  equipment: EquipmentDetail;
  condition: EquipmentCondition;
  /**
   * AC-5: reservations the change made short, or shorter; empty when none.
   * Nothing is cancelled or reassigned.
   */
  affectedReservations: UpcomingReservation[];
}

/**
 * US-45 — the change waits on the equipment row lock while a US-32 commit of
 * the same item finishes, so it uses the same limits as the commit.
 */
const STATUS_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;

/** US-30 — one item's availability for the window that was asked about. */
export type AvailabilityReport = ItemAvailability & { start: Date; end: Date };

@Injectable()
export class EquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    // US-60: tells the other Technical Support members once a change commits.
    @Optional() private readonly statusNotifier?: EquipmentStatusNotifier,
    @Optional() private readonly equipmentNotifier?: EquipmentNotifier,
  ) {}

  /**
   * US-29 — what this caller may see of the catalogue.
   *
   * The permission matrix grants EQUIPMENT/READ at Scope.ANY only, so there is
   * no per-record ownership rule to express here — unlike Venue's
   * draft/published split. Kept as its own method anyway, matching
   * VenuesService, so a future scope has one place to land.
   */
  visibilityFilter(user: AuthenticatedUser): Prisma.EquipmentWhereInput {
    this.access.requireScope(user, Resource.EQUIPMENT, Action.READ);
    return {};
  }

  /**
   * US-29 AC-1/AC-3/AC-4 — the catalogue, optionally searched and sorted.
   *
   * AC-4: reads straight from the database on every call; nothing is cached
   * server-side (see the controller's Cache-Control header), so an item added
   * or edited a moment ago is present in the next response.
   */
  async findAllForUser(
    user: AuthenticatedUser,
    query: BrowseEquipmentDto = {},
  ): Promise<EquipmentListItem[]> {
    const visibility = this.visibilityFilter(user);

    const where: Prisma.EquipmentWhereInput = query.search
      ? {
          AND: [
            visibility,
            { type: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : visibility;

    return this.prisma.equipment.findMany({
      where,
      orderBy: this.orderBy(query),
      select: EQUIPMENT_LIST_SELECT,
    });
  }

  /**
   * AC-3 — sorting. Defaults to type ascending, matching a lookup-by-type scan.
   *
   * Only `location` is nullable (`type` and `totalQuantity` are required
   * columns) — Prisma's `{ sort, nulls }` form is valid solely for a nullable
   * field, so a plain direction is used for the other two.
   */
  private orderBy(
    query: BrowseEquipmentDto,
  ): Prisma.EquipmentOrderByWithRelationInput[] {
    const field = query.sortBy ?? EquipmentSortField.TYPE;
    const order = query.sortOrder ?? SortOrder.ASC;

    if (field === EquipmentSortField.LOCATION) {
      return [{ location: { sort: order, nulls: 'last' } }];
    }

    return [{ [field]: order } as Prisma.EquipmentOrderByWithRelationInput];
  }

  /** US-29 AC-2 — one item's full detail, including operational status. */
  async findOneForUser(user: AuthenticatedUser, id: string): Promise<EquipmentDetail> {
    const item = await this.findDetail(this.prisma, {
      AND: [{ id }, this.visibilityFilter(user)],
    });

    if (!item) {
      throw new NotFoundException('equipment not found');
    }

    return item;
  }

  /** US-45 — every item's units by condition, for the catalogue. */
  async findConditions(user: AuthenticatedUser): Promise<EquipmentCondition[]> {
    const items = await this.prisma.equipment.findMany({
      where: this.visibilityFilter(user),
      select: CONDITION_SELECT,
    });
    return items.map(toCondition);
  }

  /** US-45 AC-2 — the item's status history, newest first, with quantities. */
  async findStatusHistory(user: AuthenticatedUser, equipmentId: string): Promise<StatusHistoryEntry[]> {
    await this.findCondition(user, equipmentId);
    const rows = await this.prisma.equipmentStatusChange.findMany({
      where: { equipmentId },
      orderBy: [{ changedAt: 'desc' }],
      select: STATUS_HISTORY_SELECT,
    });
    // Newest first; IDs break ties in entry order (CLAUDE.md, "Ordering").
    return rows.sort(
      (a, b) => b.changedAt.getTime() - a.changedAt.getTime() || compareReadableIds(b.id, a.id),
    );
  }

  /** US-45 — one item's units by condition, for its page. */
  async findCondition(user: AuthenticatedUser, equipmentId: string): Promise<EquipmentCondition> {
    const item = await this.prisma.equipment.findFirst({
      where: { AND: [{ id: equipmentId }, this.visibilityFilter(user)] },
      select: CONDITION_SELECT,
    });
    if (!item) {
      throw new NotFoundException('equipment not found');
    }
    return toCondition(item);
  }

  /**
   * US-45 — the item's upcoming committed reservations, each with how many
   * units it is short by now and, when a move is proposed, after it (AC-5:
   * the warning shown before the change is saved). Past reservations are not
   * listed. Read-only; changeStatus() works the shortage out again under the
   * lock, so what it returns is what held when the change was saved.
   */
  async findUpcomingReservations(
    user: AuthenticatedUser,
    equipmentId: string,
    proposal: ProposedStatusMoveDto = {},
  ): Promise<UpcomingReservation[]> {
    const item = await this.prisma.equipment.findFirst({
      where: { AND: [{ id: equipmentId }, this.visibilityFilter(user)] },
      select: { ...CONDITION_SELECT, type: true },
    });

    if (!item) {
      throw new NotFoundException('equipment not found');
    }

    const now = new Date();
    const { from, to, quantity } = proposal;
    // A proposal that could not be saved (more units than are in `from`) is
    // previewed as far as it can go, so the warning still shows its effect.
    const after =
      from && to && quantity && from !== to
        ? applyStatusMove(item, from, to, Math.min(quantity, unitsIn(item, from)))
        : item;

    return this.upcomingWithShortages(this.prisma, equipmentId, now, workingQuantity({ ...item, ...after }));
  }

  /**
   * US-45 — the only place an item's damaged and under-maintenance counts are
   * written (events-status-audit.spec.ts enforces it). operationalStatus is
   * derived from them by the database.
   *
   * AC-1/AC-3: `quantity` units move between statuses; statusMoveError()
   * refuses marking more units than are working and repairing more than are
   * damaged or under maintenance. AC-2: the reason is required by the DTO and
   * stored with the quantity, who and when. AC-4: availability (US-29, US-31,
   * US-48) counts only working units, so the change takes effect at once.
   * AC-5: the reservations it made short, or shorter, come back with the
   * result. None is cancelled or reassigned.
   *
   * The item's row is locked FOR UPDATE — the same lock a US-31 commit and a
   * reservation adjustment take — and the counts are read under it, so two
   * changes of one item run one at a time and cannot together go over its
   * total (a CHECK constraint backs this up).
   *
   * US-67: the Coordinator of each event with a reservation made short is
   * told, in the transaction. US-60: once committed, every other Technical
   * Support member is told, best-effort.
   */
  async changeStatus(
    user: AuthenticatedUser,
    equipmentId: string,
    dto: ChangeEquipmentStatusDto,
  ): Promise<StatusChangeResult> {
    this.access.requireScope(user, Resource.EQUIPMENT, Action.UPDATE);

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Equipment" WHERE "id" = ${equipmentId} FOR UPDATE`;

      if (locked.length === 0) {
        throw new NotFoundException('equipment not found');
      }

      const item = await tx.equipment.findUniqueOrThrow({
        where: { id: equipmentId },
        select: { ...CONDITION_SELECT, type: true },
      });

      const error = statusMoveError(item, dto.from, dto.to, dto.quantity);
      if (error) {
        throw new ConflictException(error);
      }

      // The change is recorded against the caller (AC-2). A signed token can
      // outlive its user — deleted, or issued by another database — and that
      // must ask them to log in again rather than fail on the foreign key.
      const author = await tx.user.findUnique({
        where: { id: user.userId },
        select: { id: true },
      });
      if (!author) {
        throw new UnauthorizedException('your account no longer exists, please log in again');
      }

      const now = new Date();
      const before = await loadShortages(tx, [equipmentId], now);

      const counts = applyStatusMove(item, dto.from, dto.to, dto.quantity);
      await tx.equipment.update({ where: { id: equipmentId }, data: counts });

      await tx.equipmentStatusChange.create({
        data: {
          equipmentId,
          fromStatus: dto.from,
          toStatus: dto.to,
          quantity: dto.quantity,
          reason: dto.reason,
          changedById: user.userId,
        },
      });

      const upcoming = await this.upcomingWithShortages(tx, equipmentId, now);
      const affectedReservations = upcoming.filter(
        (r) => r.shortBy > (before.get(r.id) ?? 0),
      );

      // US-67: the Coordinator of each event a reservation was made short for,
      // once per event, with the quantity. In the transaction, so the notice
      // exists iff the change did.
      if (affectedReservations.length > 0) {
        await this.equipmentNotifier?.unavailable(
          tx,
          {
            type: item.type,
            status: dto.to,
            reason: dto.reason,
            quantity: dto.quantity,
            totalQuantity: item.totalQuantity,
          },
          affectedReservations.map((r) => ({
            id: r.event.id,
            name: r.event.name,
            coordinatorId: r.event.coordinator?.id ?? null,
            shortBy: r.shortBy,
          })),
        );
      }

      const equipment = await this.findDetail(tx, { id: equipmentId });
      const condition = toCondition({ ...item, ...counts });

      return { equipment: equipment!, condition, affectedReservations };
    }, STATUS_TRANSACTION_OPTIONS);

    await this.statusNotifier?.statusChanged({
      equipmentId,
      toStatus: dto.to,
      quantity: dto.quantity,
      reason: dto.reason,
      actorId: user.userId,
    });

    return result;
  }

  /**
   * US-45 — the item's upcoming committed reservations with their shortage,
   * now and with `workingAfter` working units.
   */
  private async upcomingWithShortages(
    client: Prisma.TransactionClient,
    equipmentId: string,
    now: Date,
    workingAfter?: number,
  ): Promise<UpcomingReservation[]> {
    const [rows, shortNow, shortAfter] = await Promise.all([
      client.equipmentReservation.findMany({
        where: upcomingReservationsWhere(equipmentId, now),
        orderBy: [{ start: 'asc' }, { id: 'asc' }],
        select: UPCOMING_RESERVATION_SELECT,
      }),
      loadShortages(client, [equipmentId], now),
      workingAfter === undefined
        ? null
        : loadShortages(client, [equipmentId], now, new Map([[equipmentId, workingAfter]])),
    ]);

    return rows.map(({ suggestions, ...row }) => ({
      ...row,
      shortBy: shortNow.get(row.id) ?? 0,
      shortByAfter: (shortAfter ?? shortNow).get(row.id) ?? 0,
      ...latestAnswer(suggestions),
    }));
  }

  /** The detail fields plus the latest status change, flattened. */
  private async findDetail(
    client: Prisma.TransactionClient,
    where: Prisma.EquipmentWhereInput,
  ): Promise<EquipmentDetail | null> {
    const item = await client.equipment.findFirst({
      where,
      select: {
        ...EQUIPMENT_DETAIL_SELECT,
        statusChanges: {
          orderBy: [{ changedAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: STATUS_CHANGE_SELECT,
        },
      },
    });

    if (!item) {
      return null;
    }

    const { statusChanges, ...detail } = item;
    return { ...detail, latestStatusChange: statusChanges[0] ?? null };
  }

  /**
   * US-30 — how many units of one item are free for a date and time.
   *
   * AC-1: the free count for the window. AC-2: units committed to an
   * overlapping event are subtracted (the shared holdingReservationsWhere
   * query, also used by US-32's commit). AC-3: a damaged or under-maintenance
   * item contributes no units. AC-4: fullyAvailable is false when the
   * requested quantity exceeds the free count.
   *
   * Read-only: this answers the question and locks nothing. Locking is US-32.
   */
  async checkAvailability(
    user: AuthenticatedUser,
    equipmentId: string,
    dto: CheckAvailabilityDto,
  ): Promise<AvailabilityReport> {
    const visibility = this.visibilityFilter(user);
    const window = { start: dto.start, end: dto.end };

    const [equipment, held] = await Promise.all([
      this.prisma.equipment.findFirst({
        where: { AND: [{ id: equipmentId }, visibility] },
        select: AVAILABILITY_EQUIPMENT_SELECT,
      }),
      this.prisma.equipmentReservation.findMany({
        where: holdingReservationsWhere([equipmentId], window),
        select: { quantity: true, start: true, end: true },
      }),
    ]);

    if (!equipment) {
      throw new NotFoundException('equipment not found');
    }

    return {
      ...computeItemAvailability({
        equipment,
        requestedQuantity: dto.quantity,
        reservations: held,
        window,
      }),
      start: window.start,
      end: window.end,
    };
  }

  /**
   * US-19 AC-3 — for each equipment line an event asks for (US-28), how many
   * units are free over the event's dates, by US-30's rules. Read-only, like
   * checkAvailability: nothing is reserved.
   *
   * The event's own APPROVED reservations are not counted against it: units
   * already reserved for this event are its own, not a shortfall. A line not
   * linked to the catalogue, or an event without dates, cannot be counted and
   * comes back with availableQuantity null.
   *
   * Access is the caller's job: this is called only after the caller's own
   * check on the event (VenuesService.getSuitability).
   */
  async freeUnitsForEventRequirements(
    eventId: string,
    window: { start: Date; end: Date } | null,
  ): Promise<{ item: string; requestedQuantity: number; availableQuantity: number | null }[]> {
    const lines = inEntryOrder(
      await this.prisma.equipmentRequirement.findMany({
        where: { eventId },
        select: {
          id: true,
          createdAt: true,
          equipmentType: true,
          quantity: true,
          equipment: { select: AVAILABILITY_EQUIPMENT_SELECT },
        },
      }),
    );

    const linkedIds = [
      ...new Set(lines.flatMap((line) => (line.equipment ? [line.equipment.id] : []))),
    ];
    const held =
      window && linkedIds.length > 0
        ? await this.prisma.equipmentReservation.findMany({
            where: { ...holdingReservationsWhere(linkedIds, window), eventId: { not: eventId } },
            select: { equipmentId: true, quantity: true, start: true, end: true },
          })
        : [];

    return lines.map((line) => ({
      item: line.equipmentType,
      requestedQuantity: line.quantity,
      availableQuantity:
        window && line.equipment
          ? computeItemAvailability({
              equipment: line.equipment,
              requestedQuantity: line.quantity,
              reservations: held.filter((r) => r.equipmentId === line.equipment!.id),
              window,
            }).availableQuantity
          : null,
    }));
  }
}

