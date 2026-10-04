import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { BrowseEquipmentDto, EquipmentSortField, SortOrder } from './dto/browse-equipment.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import {
  computeItemAvailability,
  holdingReservationsWhere,
  ItemAvailability,
} from './equipment-availability';

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

export type EquipmentListItem = Prisma.EquipmentGetPayload<{
  select: typeof EQUIPMENT_LIST_SELECT;
}>;
export type EquipmentDetail = Prisma.EquipmentGetPayload<{
  select: typeof EQUIPMENT_DETAIL_SELECT;
}>;

/** US-30 — one item's availability for the window that was asked about. */
export type AvailabilityReport = ItemAvailability & { start: Date; end: Date };

@Injectable()
export class EquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
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
    const item = await this.prisma.equipment.findFirst({
      where: { AND: [{ id }, this.visibilityFilter(user)] },
      select: EQUIPMENT_DETAIL_SELECT,
    });

    if (!item) {
      throw new NotFoundException('equipment not found');
    }

    return item;
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
