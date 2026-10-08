import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AccessibilityFeature,
  EventStatus,
  Prisma,
  RoomLayout,
} from '@prisma/client';

import { AccessControlService } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { TECHNICAL_SUPPORT_VISIBLE_STATUSES } from '../events/event-status.machine';
import { PrismaService } from '../prisma/prisma.service';

/** US-31 AC-3 — shown in place of requirements when none are recorded. */
export const NO_REQUIREMENTS_MESSAGE =
  'No equipment or technical requirements have been recorded for this event.';

/** One equipment line the Coordinator recorded for the event (US-28). */
export interface CoordinatorRequirement {
  id: string;
  equipmentType: string;
  quantity: number;
  notes: string | null;
}

/**
 * US-31 — an event's equipment and technical requirements, as Technical
 * Support sees them.
 *
 * AC-1 names two recorders and three sources: the Organiser's free-text
 * equipment needs, and the Coordinator's structured requirement rows and
 * technical support notes (US-28). All three are returned together.
 *
 * Deliberately narrow: the event's name, description, status and window
 * identify it; everything else (attendance, layout, accessibility,
 * programme) is on the separate details route.
 */
export interface EventRequirementsView {
  eventId: string;
  name: string | null;
  description: string | null;
  status: EventStatus;
  proposedStart: Date | null;
  proposedEnd: Date | null;
  /** AC-1/AC-2: the Organiser's own words, in full. */
  organiserEquipmentNeeds: string | null;
  /** AC-1/AC-2: what was requested, line by line — type, quantity, notes. */
  coordinatorRequirements: CoordinatorRequirement[];
  /** AC-1/AC-2: the Coordinator's technical support notes, in full. */
  technicalSupportNeeds: string | null;
  /** AC-3: false when none of the three sources has anything recorded. */
  hasRequirements: boolean;
  /** AC-3: set only when hasRequirements is false. */
  message: string | null;
}

/**
 * The full event, for Technical Support to read after the requirements —
 * the "View more details" page. Read-only.
 */
export interface EventDetailsView {
  eventId: string;
  name: string | null;
  description: string | null;
  status: EventStatus;
  proposedStart: Date | null;
  proposedEnd: Date | null;
  expectedAttendance: number | null;
  preferredLayout: RoomLayout | null;
  layoutNotes: string | null;
  accessibilityRequirements: AccessibilityFeature[];
  accessibilityNotes: string | null;
  programme: string | null;
  coordinator: { name: string; email: string } | null;
}

/** Oldest first, so rows read in the order the Coordinator entered them. */
const COORDINATOR_REQUIREMENTS_ORDER: Prisma.EquipmentRequirementOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];

const EVENT_SELECT = {
  id: true,
  name: true,
  description: true,
  status: true,
  proposedStart: true,
  proposedEnd: true,
  equipmentNeeds: true,
  technicalSupportNeeds: true,
  equipmentRequirements: {
    select: { id: true, equipmentType: true, quantity: true, notes: true },
    orderBy: COORDINATOR_REQUIREMENTS_ORDER,
  },
} as const satisfies Prisma.EventRequestSelect;

type SelectedEvent = Prisma.EventRequestGetPayload<{ select: typeof EVENT_SELECT }>;

const DETAILS_SELECT = {
  id: true,
  name: true,
  description: true,
  status: true,
  proposedStart: true,
  proposedEnd: true,
  expectedAttendance: true,
  preferredLayout: true,
  layoutNotes: true,
  accessibilityRequirements: true,
  accessibilityNotes: true,
  programme: true,
  coordinator: { select: { name: true, email: true } },
} as const satisfies Prisma.EventRequestSelect;

/** Blank or whitespace-only text is no requirement at all. */
export function recordedText(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/**
 * US-31 AC-4 — which events the requirements list shows: a submitted
 * (non-draft) event with at least one requirement source. Opening a single
 * event (requirements or details) needs only "submitted". The query
 * narrows; hasAnySource() below finishes the job for whitespace-only text,
 * which SQL equality cannot express.
 */
export const REQUIREMENTS_VISIBLE_WHERE: Prisma.EventRequestWhereInput = {
  status: { in: [...TECHNICAL_SUPPORT_VISIBLE_STATUSES] },
  OR: [
    { AND: [{ equipmentNeeds: { not: null } }, { NOT: { equipmentNeeds: '' } }] },
    { equipmentRequirements: { some: {} } },
    {
      AND: [
        { technicalSupportNeeds: { not: null } },
        { NOT: { technicalSupportNeeds: '' } },
      ],
    },
  ],
};

export function hasAnySource(event: {
  equipmentNeeds: string | null;
  technicalSupportNeeds: string | null;
  requirementCount: number;
}): boolean {
  return (
    recordedText(event.equipmentNeeds) !== null ||
    recordedText(event.technicalSupportNeeds) !== null ||
    event.requirementCount > 0
  );
}

export function toRequirementsView(event: SelectedEvent): EventRequirementsView {
  const organiserEquipmentNeeds = recordedText(event.equipmentNeeds);
  const technicalSupportNeeds = recordedText(event.technicalSupportNeeds);
  const coordinatorRequirements = event.equipmentRequirements.map((row) => ({
    id: row.id,
    equipmentType: row.equipmentType,
    quantity: row.quantity,
    notes: recordedText(row.notes),
  }));
  const hasRequirements = hasAnySource({
    equipmentNeeds: organiserEquipmentNeeds,
    technicalSupportNeeds,
    requirementCount: coordinatorRequirements.length,
  });

  return {
    eventId: event.id,
    name: event.name,
    description: event.description,
    status: event.status,
    proposedStart: event.proposedStart,
    proposedEnd: event.proposedEnd,
    organiserEquipmentNeeds,
    coordinatorRequirements,
    technicalSupportNeeds,
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
   * US-31 AC-4 — submitted (non-draft) events with at least one requirement
   * source, soonest first. A draft never appears, and neither does an event
   * with nothing recorded in any of the three sources.
   */
  async findEventsWithRequirements(
    user: AuthenticatedUser,
  ): Promise<EventRequirementsView[]> {
    this.access.requireScope(user, Resource.EQUIPMENT, Action.READ);

    const events = await this.prisma.eventRequest.findMany({
      where: REQUIREMENTS_VISIBLE_WHERE,
      orderBy: [{ proposedStart: 'asc' }, { id: 'asc' }],
      select: EVENT_SELECT,
    });

    return events.map(toRequirementsView).filter((view) => view.hasRequirements);
  }

  /**
   * US-31 AC-1/AC-2/AC-3 — one submitted event's requirements.
   *
   * A draft is reported as not found rather than forbidden, matching
   * assertEventAccess(): admitting a draft exists leaks it (AC-4). A
   * submitted event with nothing recorded is returned with hasRequirements
   * false and the AC-3 message, rather than as blank fields.
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

  /**
   * "View more details" — the full event for Technical Support, under the
   * same rule as findForEvent(): any submitted (non-draft) event, whether or
   * not it has requirements recorded, so the button works from every
   * requirements page. Drafts and unknown ids are 404 (AC-4).
   */
  async findDetailsForEvent(
    user: AuthenticatedUser,
    eventId: string,
  ): Promise<EventDetailsView> {
    this.access.requireScope(user, Resource.EQUIPMENT, Action.READ);

    const event = await this.prisma.eventRequest.findFirst({
      where: {
        id: eventId,
        status: { in: [...TECHNICAL_SUPPORT_VISIBLE_STATUSES] },
      },
      select: DETAILS_SELECT,
    });

    if (!event) {
      throw new NotFoundException('event not found');
    }

    return {
      eventId: event.id,
      name: event.name,
      description: event.description,
      status: event.status,
      proposedStart: event.proposedStart,
      proposedEnd: event.proposedEnd,
      expectedAttendance: event.expectedAttendance,
      preferredLayout: event.preferredLayout,
      layoutNotes: event.layoutNotes,
      accessibilityRequirements: event.accessibilityRequirements,
      accessibilityNotes: event.accessibilityNotes,
      programme: event.programme,
      coordinator: event.coordinator,
    };
  }
}
