import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventRequest, EventStatus, Prisma } from '@prisma/client';

import { AccessControlService, PublicEventView } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventRequestDto } from './dto/create-event-request.dto';
import { canTransition } from './event-status.transitions';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
  ) {}

  /**
   * US-03 — create and submit an event request (AC-1, AC-2, AC-5).
   *
   * The row is created in DRAFT (the schema default) and moved to SUBMITTED
   * through setStatus() inside one transaction, so SUBMITTED is only ever
   * reached via a validated transition (CLAUDE.md §3.4). The caller never sees
   * the intermediate DRAFT.
   */
  async createAndSubmit(
    user: AuthenticatedUser,
    dto: CreateEventRequestDto,
  ): Promise<EventRequest> {
    this.access.requireScope(user, Resource.EVENT, Action.CREATE);

    return this.prisma.$transaction(async (tx) => {
      const draft = await tx.eventRequest.create({
        data: {
          organiserId: user.userId,
          name: dto.name,
          purpose: dto.purpose,
          description: dto.description,
          category: dto.category,
          proposedStart: dto.proposedStart,
          proposedEnd: dto.proposedEnd,
          expectedAttendance: dto.expectedAttendance,
          preferredLayout: dto.preferredLayout ?? null,
          layoutNotes: dto.layoutNotes ?? null,
          accessibilityNeeds: dto.accessibilityNeeds ?? null,
          equipmentNeeds: dto.equipmentNeeds ?? null,
          registrationEnabled: dto.registrationEnabled ?? false,
          // status intentionally omitted — DRAFT is the schema default, and
          // the move to SUBMITTED below is a transition, not a field write.
        },
      });

      return this.setStatus(draft, EventStatus.SUBMITTED, tx);
    });
  }

  /**
   * THE status transition method. Nothing in the codebase may write
   * EventRequest.status directly — every change comes through here so the
   * transition table is enforced in one place (CLAUDE.md §3.4).
   *
   * Later stories (review, planning, cancellation) call this rather than
   * adding their own update statements.
   */
  async setStatus(
    event: EventRequest,
    next: EventStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<EventRequest> {
    if (event.status === next) {
      return event;
    }

    if (!canTransition(event.status, next)) {
      throw new ConflictException(
        `cannot change status from ${event.status} to ${next}`,
      );
    }

    const client = tx ?? this.prisma;

    return client.eventRequest.update({
      where: { id: event.id },
      data: { status: next },
    });
  }

  /** AC-4 / US-02 AC-5,6 — scoped list; the server decides what is visible. */
  async findAllForUser(
    user: AuthenticatedUser,
  ): Promise<(EventRequest | PublicEventView)[]> {
    const events = await this.prisma.eventRequest.findMany({
      where: this.access.scopedEventFilter(user),
      orderBy: { createdAt: 'desc' },
    });

    return events.map((event) => this.access.projectEvent(user, event));
  }

  /**
   * AC-4 — the Organiser sees every detail they entered plus current status.
   * Ownership is enforced before anything is returned.
   */
  async findOneForUser(
    user: AuthenticatedUser,
    id: string,
  ): Promise<EventRequest | PublicEventView> {
    const event = await this.access.assertEventAccess(user, id, Action.READ);
    return this.access.projectEvent(user, event);
  }

  /** Loads an event for a status change, enforcing the caller's scope. */
  async findForTransition(
    user: AuthenticatedUser,
    id: string,
    action: Action,
  ): Promise<EventRequest> {
    const event = await this.access.assertEventAccess(user, id, action);
    if (!event) {
      throw new NotFoundException('event request not found');
    }
    return event;
  }
}
