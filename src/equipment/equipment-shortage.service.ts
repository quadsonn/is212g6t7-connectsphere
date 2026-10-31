import { Injectable } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  LATEST_SUGGESTION_SELECT,
  latestAnswer,
  loadShortages,
  NoAlternativeNote,
  OpenSuggestion,
} from './equipment-shortage';
import { FINISHED_EVENT_STATUSES } from './equipment-status';

/**
 * US-45 — one of an event's upcoming committed reservations, with how many
 * units it is short by (0 when covered) and any open alternative suggestion.
 */
export interface EventReservationShortage {
  reservationId: string;
  equipmentId: string;
  equipmentType: string;
  quantity: number;
  /** How many units the working stock is short for this reservation; 0 if none. */
  shortBy: number;
  start: Date;
  end: Date;
  /** An alternative waiting for the Coordinator, if Technical Support suggested one. */
  openSuggestion: OpenSuggestion | null;
  /** Technical Support's record that there is no valid alternative, if made. */
  noAlternative: NoAlternativeNote | null;
}

/**
 * US-45 — reads which of an event's reservations are short now that units of
 * their items are damaged or under maintenance. For the event pages (the
 * Coordinator's and the Organiser's) and Technical Support's event screen.
 */
@Injectable()
export class EquipmentShortageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * US-45 — the event's upcoming committed reservations with their shortage:
   * how many units each is short by now that units of its item are damaged or
   * under maintenance. Derived live (loadShortages), so the flag clears by
   * itself once the reservations fit the working units again. `onlyShort`
   * leaves out the reservations that are covered.
   */
  async findEventReservations(
    eventId: string,
    { onlyShort = false }: { onlyShort?: boolean } = {},
    now: Date = new Date(),
  ): Promise<EventReservationShortage[]> {
    const rows = await this.prisma.equipmentReservation.findMany({
      where: {
        eventId,
        status: ReservationStatus.APPROVED,
        end: { gt: now },
        event: { status: { notIn: [...FINISHED_EVENT_STATUSES] } },
      },
      orderBy: [{ start: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        quantity: true,
        start: true,
        end: true,
        equipment: { select: { id: true, type: true } },
        suggestions: LATEST_SUGGESTION_SELECT,
      },
    });

    const shortBy = await loadShortages(
      this.prisma,
      rows.map((r) => r.equipment.id),
      now,
    );

    return rows
      .map((row) => ({
        reservationId: row.id,
        equipmentId: row.equipment.id,
        equipmentType: row.equipment.type,
        quantity: row.quantity,
        shortBy: shortBy.get(row.id) ?? 0,
        start: row.start,
        end: row.end,
        ...latestAnswer(row.suggestions),
      }))
      .filter((r) => !onlyShort || r.shortBy > 0);
  }
}
