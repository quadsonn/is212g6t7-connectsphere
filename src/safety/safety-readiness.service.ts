import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { EventStatus, Prisma, ReservationStatus, SafetyOutcome } from '@prisma/client';

import {
  ArrangementsListener,
  ArrangementsRegistry,
} from '../common/arrangements/arrangements.registry';
import { SAFETY_CHECK_ELIGIBLE_STATUSES } from '../events/event-status.machine';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  evaluateReadiness,
  Readiness,
  ReadinessFacts,
} from './safety-readiness.rules';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Requirement change 6 — puts events into, and takes them out of, the Safety
 * queue.
 *
 * An event enters AWAITING_SAFETY_CHECK on its own once its arrangements are
 * confirmed (the team's assumption, rather than the Coordinator submitting it).
 * Two things drive that:
 *  - the ArrangementsRegistry signal, sent as bookings, reservations and
 *    technical requirements change, which makes it prompt; and
 *  - syncAll(), run whenever the queue is read, which makes it self-healing: a
 *    missed signal delays an event's entry rather than losing it.
 *
 * The same check runs the other way: an event waiting for its check whose
 * arrangements stop being confirmed (an approval reversed, a new booking
 * requested) goes back to PLANNING instead of being reviewed on stale facts.
 *
 * A review that asked for changes or rejected the event puts it on hold: it is
 * not queued again automatically, however complete its arrangements are, until
 * the Coordinator answers by resubmitting it (SafetyService.resubmit). This is
 * what stops an unchanged event bouncing straight back to the Safety Officer.
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

  /** The facts the readiness rule decides on, read from the database. */
  async loadFacts(eventId: string, client: Db = this.prisma): Promise<ReadinessFacts> {
    const [bookings, requirements, reservations] = await Promise.all([
      client.venueBooking.findMany({
        where: { eventId },
        select: { status: true },
      }),
      client.equipmentRequirement.findMany({
        where: { eventId },
        select: { equipmentId: true, quantity: true },
      }),
      client.equipmentReservation.findMany({
        where: { eventId, status: ReservationStatus.APPROVED },
        select: { equipmentId: true, quantity: true, status: true },
      }),
    ]);

    return { bookings, requirements, reservations };
  }

  async evaluate(eventId: string, client: Db = this.prisma): Promise<Readiness> {
    return evaluateReadiness(await this.loadFacts(eventId, client));
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

  /** Moves one event into or out of the queue to match its arrangements. */
  async syncEvent(eventId: string): Promise<void> {
    const event = await this.prisma.eventRequest.findUnique({
      where: { id: eventId },
    });
    if (!event) return;

    const eligible = SAFETY_CHECK_ELIGIBLE_STATUSES.includes(event.status);
    if (!eligible && event.status !== EventStatus.AWAITING_SAFETY_CHECK) return;

    const { ready } = await this.evaluate(eventId);

    try {
      if (eligible && ready && !(await this.isHeld(eventId))) {
        await this.events.setStatus(event, EventStatus.AWAITING_SAFETY_CHECK);
      } else if (event.status === EventStatus.AWAITING_SAFETY_CHECK && !ready) {
        await this.events.setStatus(event, EventStatus.PLANNING);
      }
    } catch (error) {
      // Someone else moved the event first (a decision, a cancellation): the
      // state they left it in is the right one.
      if (!(error instanceof ConflictException)) throw error;
    }
  }

  /**
   * Re-checks every event that could be due for, or is waiting on, a safety
   * check. Cheap by construction: only events that already have an approved
   * booking can possibly be ready.
   */
  async syncAll(): Promise<void> {
    const candidates = await this.prisma.eventRequest.findMany({
      where: {
        OR: [
          {
            status: { in: [...SAFETY_CHECK_ELIGIBLE_STATUSES] },
            venueBookings: { some: { status: 'APPROVED' } },
          },
          { status: EventStatus.AWAITING_SAFETY_CHECK },
        ],
      },
      select: { id: true },
    });

    for (const { id } of candidates) {
      await this.syncEvent(id);
    }
  }
}
