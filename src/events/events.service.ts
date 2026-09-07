import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventRequest, EventStatus, Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AccessControlService, PublicEventView } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventRequestDto } from './dto/create-event-request.dto';
import { DraftEventRequestDto } from './dto/draft-event-request.dto';
import { canTransition } from './event-status.transitions';

/**
 * The Organiser-editable scalar columns. Typed as the subset Prisma accepts
 * for both create and update, so one mapper serves saveDraft and updateDraft.
 */
type DraftFields = Partial<
  Pick<
    Prisma.EventRequestUncheckedCreateInput,
    | 'name'
    | 'purpose'
    | 'description'
    | 'category'
    | 'proposedStart'
    | 'proposedEnd'
    | 'expectedAttendance'
    | 'preferredLayout'
    | 'layoutNotes'
    | 'accessibilityNeeds'
    | 'equipmentNeeds'
    | 'registrationEnabled'
  >
>;

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
   * US-04 AC-1 — save a partial draft.
   *
   * No completeness check: the DTO permits every field to be absent, and the
   * row is stored at the schema default of DRAFT. Nothing transitions here, so
   * setStatus() is deliberately not involved.
   */
  async saveDraft(
    user: AuthenticatedUser,
    dto: DraftEventRequestDto,
  ): Promise<EventRequest> {
    this.access.requireScope(user, Resource.EVENT, Action.CREATE);

    return this.prisma.eventRequest.create({
      data: {
        organiserId: user.userId,
        ...this.draftFields(dto),
      },
    });
  }

  /**
   * US-04 AC-2 — continue editing a draft.
   *
   * AC-5: only a DRAFT is editable. A submitted request is visible but frozen,
   * which is reported as 409 rather than 404 — the Organiser may see it, so
   * hiding it would be misleading; the request is simply no longer a draft.
   *
   * Only the keys present in the payload are written, so a partial edit cannot
   * silently blank fields the Organiser did not touch.
   */
  async updateDraft(
    user: AuthenticatedUser,
    id: string,
    dto: DraftEventRequestDto,
  ): Promise<EventRequest> {
    const event = await this.access.assertEventAccess(user, id, Action.UPDATE);

    this.assertIsDraft(event);

    return this.prisma.eventRequest.update({
      where: { id: event.id },
      data: this.draftFields(dto),
    });
  }

  /**
   * US-04 AC-4 — submit a completed draft.
   *
   * Completeness is checked by validating the stored row against
   * CreateEventRequestDto, the same class POST /events uses. There is one
   * definition of "complete" in the codebase; this path cannot drift from the
   * direct-submission path.
   */
  async submitDraft(
    user: AuthenticatedUser,
    id: string,
  ): Promise<EventRequest> {
    const event = await this.access.assertEventAccess(user, id, Action.SUBMIT);

    this.assertIsDraft(event);
    await this.assertReadyForSubmission(event);

    return this.setStatus(event, EventStatus.SUBMITTED);
  }

  /** AC-5: editing and submitting apply to drafts only. */
  private assertIsDraft(event: EventRequest): void {
    if (event.status !== EventStatus.DRAFT) {
      throw new ConflictException(
        `request is ${event.status} and can no longer be edited as a draft`,
      );
    }
  }

  /**
   * Runs the submission rules (US-03 AC-1/AC-3/AC-5) against a stored draft,
   * reporting every missing or invalid field at once in the same shape the
   * ValidationPipe produces, so clients handle both paths identically.
   */
  private async assertReadyForSubmission(event: EventRequest): Promise<void> {
    const candidate = plainToInstance(CreateEventRequestDto, {
      name: event.name ?? undefined,
      purpose: event.purpose ?? undefined,
      description: event.description ?? undefined,
      category: event.category ?? undefined,
      proposedStart: event.proposedStart ?? undefined,
      proposedEnd: event.proposedEnd ?? undefined,
      expectedAttendance: event.expectedAttendance ?? undefined,
    });

    const errors = await validate(candidate, { whitelist: true });

    if (errors.length > 0) {
      throw new BadRequestException(
        errors.flatMap((error) => Object.values(error.constraints ?? {})),
      );
    }
  }

  /** Maps the DTO to a Prisma payload, omitting keys the caller did not send. */
  private draftFields(dto: DraftEventRequestDto): DraftFields {
    const fields: Record<string, unknown> = {};

    for (const key of [
      'name',
      'purpose',
      'description',
      'category',
      'proposedStart',
      'proposedEnd',
      'expectedAttendance',
      'preferredLayout',
      'layoutNotes',
      'accessibilityNeeds',
      'equipmentNeeds',
      'registrationEnabled',
    ] as const) {
      if (dto[key] !== undefined) {
        fields[key] = dto[key];
      }
    }

    return fields as DraftFields;
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
