import { Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus, Prisma } from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { TECHNICAL_SUPPORT_VISIBLE_STATUSES } from '../events/event-status.machine';
import { PrismaService } from '../prisma/prisma.service';

/** US-31 AC-3 — shown in place of requirements when none are recorded. */
export const NO_REQUIREMENTS_MESSAGE =
  'No equipment or technical requirements have been recorded for this event.';

/**
 * US-31 — an event's equipment and technical requirements, as Technical
 * Support sees them.
 *
 * Deliberately narrow: enough of the event to identify it and its date and
 * time, plus the requirements. Everything else on the request (attendance,
 * layout, accessibility, organiser) stays out — Technical Support hold no
 * EVENT/READ grant.
 *
 * AC-1 names two sources: the Organiser's free-text equipment needs, and
 * requirements recorded by the Coordinator. Only the first exists in the
 * codebase today; the Coordinator's structured records are #27, which should
 * add a field here rather than a second endpoint.
 */
export interface EventRequirementsView {
  eventId: string;
  name: string | null;
  status: EventStatus;
  proposedStart: Date | null;
  proposedEnd: Date | null;
  /** AC-1/AC-2: the Organiser's own words, in full — not a yes/no flag. */
  organiserEquipmentNeeds: string | null;
  /** AC-3: false means nothing is recorded; see `message`. */
  hasRequirements: boolean;
  /** AC-3: set only when hasRequirements is false. */
  message: string | null;
}

const EVENT_SELECT = {
  id: true,
  name: true,
  status: true,
  proposedStart: true,
  proposedEnd: true,
  equipmentNeeds: true,
} as const satisfies Prisma.EventRequestSelect;

type SelectedEvent = Prisma.EventRequestGetPayload<{ select: typeof EVENT_SELECT }>;

/** Blank or whitespace-only text is no requirement at all. */
export function recordedText(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

export function toRequirementsView(event: SelectedEvent): EventRequirementsView {
  const organiserEquipmentNeeds = recordedText(event.equipmentNeeds);
  const hasRequirements = organiserEquipmentNeeds !== null;

  return {
    eventId: event.id,
    name: event.name,
    status: event.status,
    proposedStart: event.proposedStart,
    proposedEnd: event.proposedEnd,
    organiserEquipmentNeeds,
    hasRequirements,
    message: hasRequirements ? null : NO_REQUIREMENTS_MESSAGE,
  };
}

@Injectable()
export class EquipmentRequirementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
  ) {}

  /**
   * US-31 AC-4 — submitted (non-draft) events that have requirements, soonest
   * first. A draft never appears, and neither does an event with nothing
   * recorded.
   */
  async findEventsWithRequirements(
    user: AuthenticatedUser,
  ): Promise<EventRequirementsView[]> {
    this.access.requireScope(user, Resource.EQUIPMENT, Action.READ);

    const events = await this.prisma.eventRequest.findMany({
      where: {
        status: { in: [...TECHNICAL_SUPPORT_VISIBLE_STATUSES] },
        equipmentNeeds: { not: null },
        NOT: { equipmentNeeds: '' },
      },
      orderBy: [{ proposedStart: 'asc' }, { id: 'asc' }],
      select: EVENT_SELECT,
    });

    // Whitespace-only text passes the query but records nothing.
    return events
      .map(toRequirementsView)
      .filter((view) => view.hasRequirements);
  }

  /**
   * US-31 AC-1/AC-2/AC-3 — one submitted event's requirements.
   *
   * A draft is reported as not found rather than forbidden, matching
   * assertEventAccess(): admitting a draft exists leaks it (AC-4). An event
   * with nothing recorded is returned with hasRequirements false and the AC-3
   * message, rather than as blank fields.
   */
  async findForEvent(
    user: AuthenticatedUser,
    eventId: string,
  ): Promise<EventRequirementsView> {
    this.access.requireScope(user, Resource.EQUIPMENT, Action.READ);

    const event = await this.prisma.eventRequest.findFirst({
      where: {
        id: eventId,
        status: { in: [...TECHNICAL_SUPPORT_VISIBLE_STATUSES] },
      },
      select: EVENT_SELECT,
    });

    if (!event) {
      throw new NotFoundException('event not found');
    }

    return toRequirementsView(event);
  }
}
