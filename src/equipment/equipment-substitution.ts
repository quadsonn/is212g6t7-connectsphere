import { EventStatus, Prisma, SubstitutionStatus } from '@prisma/client';

/**
 * Equipment substitutions, kept free of Nest and of database access so they
 * can be unit-tested directly (CLAUDE.md §8).
 *
 * When Technical Support takes an item out of service, each reservation of it
 * on a CONFIRMED event needs an answer from them: a replacement item, or "no
 * valid alternative". Reservations on events that have not reached CONFIRMED
 * need none — the Coordinator is still arranging those and can swap freely.
 */

/** The only event status at which Technical Support must offer a replacement. */
export function requiresSubstitution(eventStatus: EventStatus): boolean {
  return eventStatus === EventStatus.CONFIRMED;
}

/** What Technical Support chose for one reservation. */
export interface SubstitutionChoice {
  reservationId: string;
  /** A replacement item, or absent when `noAlternative` is set. */
  alternativeEquipmentId?: string;
  /** Nothing in the catalogue fits; the Coordinator can only acknowledge. */
  noAlternative?: boolean;
}

/** The slice of an affected reservation the plan needs. */
export interface AffectedReservation {
  id: string;
  quantity: number;
  start: Date;
  end: Date;
  event: { status: EventStatus };
}

/**
 * Why a set of choices does not answer the reservations that need one, or null
 * when it does. Nothing is saved on an error: the status change and every
 * substitution stand or fall together.
 *
 *  - a choice names exactly one of an item or "no alternative"
 *  - one choice per reservation
 *  - every reservation on a CONFIRMED event is answered
 *  - no choice is for a reservation that needs none (or is not affected)
 */
export function substitutionPlanError(
  affected: readonly AffectedReservation[],
  choices: readonly SubstitutionChoice[],
): string | null {
  for (const c of choices) {
    const hasItem = Boolean(c.alternativeEquipmentId);
    if (hasItem === Boolean(c.noAlternative)) {
      return `reservation ${c.reservationId}: choose an alternative item, or "no valid alternative" — not both, not neither`;
    }
  }

  const seen = new Set<string>();
  for (const c of choices) {
    if (seen.has(c.reservationId)) {
      return `reservation ${c.reservationId} has more than one substitution`;
    }
    seen.add(c.reservationId);
  }

  const required = new Set(
    affected
      .filter((r) => requiresSubstitution(r.event.status))
      .map((r) => r.id),
  );

  const unexpected = choices.filter((c) => !required.has(c.reservationId));
  if (unexpected.length > 0) {
    return (
      `${unexpected.map((c) => c.reservationId).join(', ')} ` +
      'not on a confirmed event, or not reserved with this item — no alternative is needed'
    );
  }

  const missing = [...required].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    return `an alternative (or "no valid alternative") is required for confirmed events: ${missing.join(', ')}`;
  }

  return null;
}

/** A substitution is decided once, by the Coordinator, while it is PENDING. */
export function substitutionDecisionError(
  status: SubstitutionStatus,
  action: 'accept' | 'decline',
): string | null {
  if (status === SubstitutionStatus.PENDING) return null;
  if (status === SubstitutionStatus.VOID) {
    return 'this substitution is closed: the equipment is back in service';
  }
  return `this substitution has already been ${status.toLowerCase()}${
    action === 'accept' && status === SubstitutionStatus.DECLINED
      ? '; a decline is final'
      : ''
  }`;
}

/** Accepting needs a real item; "no valid alternative" can only be declined. */
export function acceptError(
  alternativeEquipmentId: string | null,
): string | null {
  return alternativeEquipmentId
    ? null
    : 'Technical Support found no valid alternative, so there is nothing to accept — decline to acknowledge it';
}

/** What the Coordinator and Technical Support see of a substitution. */
export const SUBSTITUTION_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  decidedAt: true,
  alternativeEquipment: {
    select: { id: true, type: true, description: true, location: true },
  },
  suggestedBy: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, name: true } },
} as const satisfies Prisma.EquipmentSubstitutionSelect;

export type SubstitutionView = Prisma.EquipmentSubstitutionGetPayload<{
  select: typeof SUBSTITUTION_SELECT;
}>;
