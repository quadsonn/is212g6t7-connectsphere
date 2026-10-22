import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { EventStatus, Prisma, ReservationStatus, SafetyOutcome } from '@prisma/client';

import {
  ArrangementsListener,
  ArrangementsRegistry,
} from '../common/arrangements/arrangements.registry';
import {
  ConfirmationFacts,
  evaluateConfirmationReadiness,
  NO_VENUE_LABEL,
  ReadinessItem,
} from '../events/confirmation-readiness.rules';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotReadyReason, Readiness } from './safety-readiness.rules';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Requirement change 6 — keeps the Safety queue honest.
 *
 * An event enters AWAITING_SAFETY_CHECK only when its Coordinator confirms the
 * arrangements (US-42, EventConfirmationService.confirm) or, after feedback,
 * resubmits it (SafetyService.resubmit) — never on its own. (Merged with
 * US-42: an automatic entry here would skip the Coordinator's Confirm and its
 * record of who confirmed and when, so it was removed.)
 *
 * What stays automatic is the way out: an event waiting for its check whose
 * arrangements stop being ready (an approval reversed, a new booking
 * requested, a hold placed) goes back to PLANNING instead of being reviewed on
 * stale facts. Two things drive that:
 *  - the ArrangementsRegistry signal, sent as bookings, reservations and
 *    technical requirements change, which makes it prompt; and
 *  - syncAll(), run whenever the queue is read, which makes it self-healing.
 *
 * "Ready" is US-42's rule (evaluateConfirmationReadiness), so the Coordinator's
 * checklist, the Safety queue and the Safety Officer's approval all agree: live
 * holds and bookings flagged for conflict review are not approved, and a
 * free-text equipment line needs its manual tick.
 *
 * Every status change goes through EventsService.setStatus().
 */
@Injectable()
export class SafetyReadinessService implements ArrangementsListener, OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly registry: ArrangementsRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  onArrangementsChanged(eventId: string): Promise<void> {
    return this.syncEvent(eventId);
  }

  /** The facts US-42's readiness rule decides on, read from the database. */
  async loadFacts(eventId: string, client: Db = this.prisma): Promise<ConfirmationFacts> {
    const [bookings, requirements, reservations] = await Promise.all([
      client.venueBooking.findMany({
        where: { eventId },
        select: { status: true, needsReview: true, holdExpiresAt: true, venue: { select: { name: true } } },
      }),
      client.equipmentRequirement.findMany({
        where: { eventId },
        select: { equipmentId: true, equipmentType: true, quantity: true, manuallyConfirmedAt: true },
      }),
      client.equipmentReservation.findMany({
        where: { eventId, status: ReservationStatus.APPROVED },
        select: { equipmentId: true, quantity: true, status: true },
      }),
    ]);

    return {
      bookings: bookings.map((b) => ({
        venueName: b.venue.name ?? 'an unnamed venue',
        status: b.status,
        needsReview: b.needsReview,
        holdExpiresAt: b.holdExpiresAt,
      })),
      requirements,
      reservations,
    };
  }

  /** Ready or not, with this module's reasons for the messages it shows. */
  async evaluate(eventId: string, client: Db = this.prisma): Promise<Readiness> {
    const { ready, items } = evaluateConfirmationReadiness(await this.loadFacts(eventId, client));
    return { ready, reasons: ready ? [] : reasonsFor(items) };
  }

  /**
   * True while the latest review is feedback the Coordinator has not answered:
   * changes requested or a rejection, not yet resubmitted. Held events wait for
   * the Coordinator rather than being queued on their own.
   */
  async isHeld(eventId: string, client: Db = this.prisma): Promise<boolean> {
    const latest = await client.safetyReview.findFirst({
      where: { eventId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { outcome: true, resubmittedAt: true },
    });

    return (
      latest !== null &&
      latest.outcome !== SafetyOutcome.APPROVED &&
      latest.resubmittedAt === null
    );
  }

  /**
   * Takes one event out of the queue if its arrangements are no longer ready.
   * Never puts one in: that is the Coordinator's Confirm (US-42).
   */
  async syncEvent(eventId: string): Promise<void> {
    const event = await this.prisma.eventRequest.findUnique({
      where: { id: eventId },
    });
    if (!event || event.status !== EventStatus.AWAITING_SAFETY_CHECK) return;

    if ((await this.evaluate(eventId)).ready) return;

    try {
      await this.events.setStatus(event, EventStatus.PLANNING);
    } catch (error) {
      // Someone else moved the event first (a decision, a cancellation): the
      // state they left it in is the right one.
      if (!(error instanceof ConflictException)) throw error;
    }
  }

  /** Re-checks every event waiting for its safety check. */
  async syncAll(): Promise<void> {
    const waiting = await this.prisma.eventRequest.findMany({
      where: { status: EventStatus.AWAITING_SAFETY_CHECK },
      select: { id: true },
    });

    for (const { id } of waiting) {
      await this.syncEvent(id);
    }
  }
}

/** US-42's checklist items as this module's reasons, for its messages. */
function reasonsFor(items: ReadinessItem[]): NotReadyReason[] {
  const reasons: NotReadyReason[] = [];
  const venues = items.filter((item) => item.kind === 'VENUE');
  if (venues.some((item) => item.label === NO_VENUE_LABEL)) {
    reasons.push('NO_APPROVED_VENUE');
  } else if (venues.some((item) => item.status !== 'OK')) {
    reasons.push('VENUE_BOOKING_PENDING');
  }
  if (items.some((item) => item.kind === 'EQUIPMENT' && item.status !== 'OK')) {
    reasons.push('EQUIPMENT_NOT_RESERVED');
  }
  return reasons;
}
