import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { BrowseEquipmentDto, EquipmentSortField, SortOrder } from './dto/browse-equipment.dto';
import { ChangeEquipmentStatusDto } from './dto/change-equipment-status.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import {
  computeItemAvailability,
  holdingReservationsWhere,
  ItemAvailability,
} from './equipment-availability';
import {
  affectsReservations,
  statusChangeError,
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

/** US-45 AC-5 — a reservation the status change puts at risk, and its event. */
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
} as const satisfies Prisma.EquipmentReservationSelect;

export type EquipmentListItem = Prisma.EquipmentGetPayload<{
  select: typeof EQUIPMENT_LIST_SELECT;
}>;
export type StatusChangeRecord = Prisma.EquipmentStatusChangeGetPayload<{
  select: typeof STATUS_CHANGE_SELECT;
}>;
export type UpcomingReservation = Prisma.EquipmentReservationGetPayload<{
  select: typeof UPCOMING_RESERVATION_SELECT;
}>;

/**
 * US-29 AC-2 — the full detail. US-45 adds the most recent status change, so
 * the reason an item is damaged or under maintenance is shown with it; null
 * for an item whose status has never been changed.
 */
export type EquipmentDetail = Prisma.EquipmentGetPayload<{
  select: typeof EQUIPMENT_DETAIL_SELECT;
}> & { latestStatusChange: StatusChangeRecord | null };

/** US-45 — what a status change returns. */
export interface StatusChangeResult {
  equipment: EquipmentDetail;
  /** AC-5: reservations affected by the change; empty when none are. */
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

  /**
   * US-45 AC-5 — the reservations that marking this item Damaged or Under
   * Maintenance would affect, so the warning can be shown before the change
   * is saved. Read-only; changeStatus() works the list out again under the
   * lock, so the answer it returns is the one that held when it was saved.
   */
  async findUpcomingReservations(
    user: AuthenticatedUser,
    equipmentId: string,
  ): Promise<UpcomingReservation[]> {
    const visibility = this.visibilityFilter(user);

    const item = await this.prisma.equipment.findFirst({
      where: { AND: [{ id: equipmentId }, visibility] },
      select: { id: true },
    });

    if (!item) {
      throw new NotFoundException('equipment not found');
    }

    return this.prisma.equipmentReservation.findMany({
      where: upcomingReservationsWhere(equipmentId, new Date()),
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
      select: UPCOMING_RESERVATION_SELECT,
    });
  }

  /**
   * US-45 — the only place Equipment.operationalStatus is written
   * (events-status-audit.spec.ts enforces it).
   *
   * AC-1/AC-3: any status may move to any other; statusChangeError() refuses
   * only a no-op. AC-2: the reason is required by the DTO and stored with the
   * change. AC-4 needs nothing here: availability (US-30) and commitment
   * (US-32) already count a non-OPERATIONAL item as having no free units.
   * AC-5: the affected reservations come back with the result.
   *
   * The item's row is locked FOR UPDATE, the same lock a US-32 commit takes,
   * so a commit and a status change of one item run one at a time: either the
   * commit lands first and is listed as affected here, or it runs after and
   * sees the item as unavailable.
   *
   * Existing reservations are left as they are — the story asks for a warning,
   * not for them to be released.
   *
   * US-60: once the change has committed, every other Technical Support member
   * is told (EquipmentStatusNotifier), best-effort.
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

      const { operationalStatus: from } = await tx.equipment.findUniqueOrThrow({
        where: { id: equipmentId },
        select: { operationalStatus: true },
      });

      const error = statusChangeError(from, dto.status);
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

      await tx.equipment.update({
        where: { id: equipmentId },
        data: { operationalStatus: dto.status },
      });

      await tx.equipmentStatusChange.create({
        data: {
          equipmentId,
          fromStatus: from,
          toStatus: dto.status,
          reason: dto.reason,
          changedById: user.userId,
        },
      });

      const affectedReservations = affectsReservations(dto.status)
        ? await tx.equipmentReservation.findMany({
            where: upcomingReservationsWhere(equipmentId, new Date()),
            orderBy: [{ start: 'asc' }, { id: 'asc' }],
            select: UPCOMING_RESERVATION_SELECT,
          })
        : [];

      const equipment = await this.findDetail(tx, { id: equipmentId });

      return { equipment: equipment!, affectedReservations };
    }, STATUS_TRANSACTION_OPTIONS);

    await this.statusNotifier?.statusChanged({
      equipmentId,
      toStatus: dto.status,
      reason: dto.reason,
      actorId: user.userId,
    });

    return result;
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
        select: {
          id: true,
          type: true,
          totalQuantity: true,
          operationalStatus: true,
        },
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
}
