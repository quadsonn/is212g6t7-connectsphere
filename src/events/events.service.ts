import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventRequest,
  EventStatus,
  NotificationType,
  Prisma,
  Role,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AccessControlService, PublicEventView } from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignCoordinatorDto } from './dto/assign-coordinator.dto';
import { AskClarificationDto } from './dto/ask-clarification.dto';
import { CreateEventRequestDto } from './dto/create-event-request.dto';
import { RespondClarificationDto } from './dto/respond-clarification.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { ReturnRequestDto } from './dto/return-request.dto';
import { DraftEventRequestDto } from './dto/draft-event-request.dto';
import {
  ASSIGNABLE_STATUSES,
  buildStatusView,
  canTransition,
  EDITABLE_STATUSES,
  EventStatusView,
} from './event-status.machine';

/**
 * US-10 AC-3 — the assigned Coordinator, exposed on every read so the main
 * point of contact is identifiable rather than an opaque id.
 *
 * Email is included because "main point of contact" implies contactability.
 * The Attendee projection strips this along with the rest of the internal
 * planning fields (US-02 AC-7).
 */
export const COORDINATOR_SELECT = {
  coordinator: { select: { id: true, name: true, email: true } },
} as const;

/**
 * US-12 — both parties resolved to contact details rather than opaque ids.
 *
 * The organiser is included because a Coordinator reviewing a request needs to
 * reach the person who raised it; US-10 established the same pattern for the
 * coordinator side. AMBIGUOUS: AC-1 lists the request's own fields and does
 * not mention the organiser — see the US-12 summary.
 *
 * Attendees never receive either: projectEvent() rebuilds the public view from
 * an explicit field list, so nested relations are dropped with the rest of the
 * internal planning data (US-02 AC-7).
 */
/**
 * US-09 AC-5 — the clarification thread, oldest first, with each entry's
 * author so the trail shows who said what and when.
 */
export const CLARIFICATION_THREAD_INCLUDE = {
  clarifications: {
    orderBy: { createdAt: 'asc' },
    include: {
      author: { select: { id: true, name: true, email: true, role: true } },
    },
  },
} as const;

export const EVENT_CONTACTS_INCLUDE = {
  coordinator: { select: { id: true, name: true, email: true } },
  organiser: { select: { id: true, name: true, email: true } },
} as const;

/**
 * US-05 — an Organiser's view of one of their requests.
 *
 * The full record plus one derived convenience flag. `clarificationRequested`
 * is computed at read time and never stored, so it cannot drift from
 * `clarificationRequest`.
 */
export type OrganiserRequestView = EventRequest & {
  /** US-11 — the consolidated view every story reads. */
  statusView: EventStatusView;
  clarificationRequested: boolean;
};

/**
 * US-07 AC-1 lists a status called "returned" that EventStatus does not have,
 * and US-05 AC-1 lists the nine enum values without it. The two stories
 * describe the same lifecycle in different vocabularies.
 *
 * Reconciled without adding a tenth status: "returned" is DRAFT with a
 * clarification attached, which is exactly what clarificationRequested already
 * reports. A client renders "Returned" when status is DRAFT and this is true.
 */
export type CoordinatorRequestView = OrganiserRequestView;

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
    | 'accessibilityRequirements'
    | 'accessibilityNotes'
    | 'equipmentNeeds'
    | 'registrationEnabled'
  >
>;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessControlService,
    private readonly notifications: NotificationsService,
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
          // US-06: preferences, not blockers — absent stays absent.
          preferredLayout: dto.preferredLayout ?? null,
          layoutNotes: dto.layoutNotes ?? null,
          accessibilityRequirements: dto.accessibilityRequirements ?? [],
          accessibilityNotes: dto.accessibilityNotes ?? null,
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

    this.assertIsEditable(event);

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

    this.assertIsEditable(event);
    await this.assertReadyForSubmission(event);

    return this.setStatus(event, EventStatus.SUBMITTED);
  }

  /**
   * US-04 AC-5: editing and submitting apply to work still in the Organiser's
   * hands.
   *
   * US-08 widened this from DRAFT alone to include RETURNED — a returned
   * request has been handed back precisely so the Organiser can amend and
   * resubmit it, and requiring a demotion to DRAFT first would add a step
   * with no purpose. A SUBMITTED or APPROVED request remains frozen.
   */
  private assertIsEditable(event: EventRequest): void {
    if (!EDITABLE_STATUSES.includes(event.status)) {
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
      'accessibilityRequirements',
      'accessibilityNotes',
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
   * US-12 — the requests in this Coordinator's queue, in full.
   *
   * Read-only. Scoping is the shared ASSIGNED filter from US-02, so this
   * cannot drift from the rule the rest of the module enforces.
   */
  async findAssignedRequests(
    user: AuthenticatedUser,
  ): Promise<CoordinatorRequestView[]> {
    const events = await this.prisma.eventRequest.findMany({
      where: this.access.scopedEventFilter(user, Action.READ),
      orderBy: { createdAt: 'desc' },
      include: EVENT_CONTACTS_INCLUDE,
    });

    return events.map((event) => this.toOrganiserView(event));
  }

  /**
   * US-12 AC-1 / AC-2 — every detail of one request the Coordinator may see.
   *
   * AC-3 is enforced by assertEventAccess(): an event outside the caller's
   * scope raises NotFoundException before any field is read, so a denied
   * request returns no event data at all rather than a filtered record.
   */
  async findAssignedRequest(
    user: AuthenticatedUser,
    id: string,
  ): Promise<CoordinatorRequestView> {
    // Establishes the caller may see this event at all (reuses US-02).
    await this.access.assertEventAccess(user, id, Action.READ);

    // Re-read with the contact relations attached.
    const event = await this.prisma.eventRequest.findUniqueOrThrow({
      where: { id },
      include: { ...EVENT_CONTACTS_INCLUDE, ...CLARIFICATION_THREAD_INCLUDE },
    });

    return this.toOrganiserView(event);
  }

  /**
   * US-07 AC-3 — approve a request.
   *
   * The status change goes through setStatus(), so SUBMITTED/UNDER_REVIEW ->
   * APPROVED is validated against the US-03 transition table and no other
   * source status can slip through.
   *
   * Stale review artefacts are cleared in the same transaction: a request that
   * was previously returned for clarification or rejected, then resubmitted
   * and approved, must not still advertise a clarification question or a
   * rejection reason.
   *
   * AMBIGUOUS: clearing them discards the record of the earlier decision.
   * There is no audit table, so that history is simply lost — see the US-07
   * summary.
   */
  async approve(
    user: AuthenticatedUser,
    id: string,
  ): Promise<CoordinatorRequestView> {
    const event = await this.access.assertEventAccess(user, id, Action.REVIEW);

    this.assertIsAssignedTo(user, event);

    const approved = await this.prisma.$transaction(async (tx) => {
      // Non-status housekeeping first, so setStatus stays the sole writer of
      // the status column.
      await tx.eventRequest.update({
        where: { id: event.id },
        data: { clarificationRequest: null, decisionReason: null },
      });

      return this.setStatus(event, EventStatus.APPROVED, tx);
    });

    return this.toOrganiserView(approved);
  }

  /**
   * US-09 AC-1/AC-2/AC-3 — the Coordinator asks the Organiser a question.
   *
   * The message is appended to the thread (AC-2/AC-5) and the request moves to
   * AWAITING_CLARIFICATION through setStatus(). clarificationRequest is also
   * updated so US-05's Organiser view keeps surfacing the outstanding question
   * without having to read the thread.
   *
   * AMBIGUOUS: that denormalisation means the same text lives in two places.
   * It is always written together with the thread entry, in one transaction,
   * and only ever holds the *latest* outstanding question — the thread remains
   * the record of the exchange.
   */
  async askClarification(
    user: AuthenticatedUser,
    id: string,
    dto: AskClarificationDto,
  ): Promise<CoordinatorRequestView> {
    const event = await this.access.assertEventAccess(user, id, Action.CLARIFY);

    this.assertIsAssignedTo(user, event);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.clarificationMessage.create({
        data: { eventId: event.id, authorId: user.userId, body: dto.question },
      });

      await tx.eventRequest.update({
        where: { id: event.id },
        data: { clarificationRequest: dto.question },
      });

      return this.setStatus(event, EventStatus.AWAITING_CLARIFICATION, tx);
    });

    // AC-4 direction 1: tell the Organiser a question is waiting. Raised after
    // the transaction commits — see NotificationsService.notifySafely.
    await this.notifications.notifySafely({
      recipientId: event.organiserId,
      type: NotificationType.CLARIFICATION_REQUESTED,
      message: `The coordinator has asked a question about "${event.name ?? 'your event request'}".`,
      relatedEventId: event.id,
    });

    return this.toOrganiserView(updated);
  }

  /**
   * US-09 AC-4 — the Organiser answers, and the Coordinator is notified.
   *
   * The answer joins the same thread, so a multi-round exchange accumulates in
   * one place. The request returns to UNDER_REVIEW: the answer is now the
   * Coordinator's to consider.
   */
  async respondToClarification(
    user: AuthenticatedUser,
    id: string,
    dto: RespondClarificationDto,
  ): Promise<OrganiserRequestView> {
    const event = await this.access.assertEventAccess(user, id, Action.CLARIFY);

    if (event.status !== EventStatus.AWAITING_CLARIFICATION) {
      throw new ConflictException(
        `there is no outstanding clarification on this request (status ${event.status})`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.clarificationMessage.create({
        data: { eventId: event.id, authorId: user.userId, body: dto.response },
      });

      // The question has been answered; nothing is outstanding.
      await tx.eventRequest.update({
        where: { id: event.id },
        data: { clarificationRequest: null },
      });

      return this.setStatus(event, EventStatus.UNDER_REVIEW, tx);
    });

    // AC-4 direction 2: the Coordinator is notified of the response.
    if (event.coordinatorId) {
      await this.notifications.notifySafely({
        recipientId: event.coordinatorId,
        type: NotificationType.CLARIFICATION_ANSWERED,
        message: `The organiser has responded on "${event.name ?? 'an event request'}".`,
        relatedEventId: event.id,
      });
    }

    return this.toOrganiserView(updated);
  }

  /**
   * US-08 — reject a request outright, with a mandatory reason.
   *
   * Distinct from returnForAmendment(): a rejection ends the request, and the
   * reason is stored in decisionReason, which US-05 AC-2 surfaces to the
   * Organiser.
   */
  async reject(
    user: AuthenticatedUser,
    id: string,
    dto: RejectRequestDto,
  ): Promise<CoordinatorRequestView> {
    return this.decide(user, id, EventStatus.REJECTED, {
      decisionReason: dto.reason,
      // A rejection supersedes any outstanding question.
      clarificationRequest: null,
    });
  }

  /**
   * US-08 — return a request to the Organiser to amend, with a mandatory
   * reason.
   *
   * Distinct from reject(): the request stays alive and becomes editable
   * again. The reason is what the Organiser must address, so it is stored in
   * clarificationRequest and surfaced by US-05 AC-3.
   */
  async returnForAmendment(
    user: AuthenticatedUser,
    id: string,
    dto: ReturnRequestDto,
  ): Promise<CoordinatorRequestView> {
    return this.decide(user, id, EventStatus.RETURNED, {
      clarificationRequest: dto.reason,
      // A return is not a rejection; clear any earlier rejection reason.
      decisionReason: null,
    });
  }

  /**
   * Shared mechanics for a review decision: authorise, record the reason, then
   * transition. The two callers differ in the status they target and the field
   * the reason lands in — everything else is identical, and keeping it in one
   * place means neither can bypass setStatus() or the ownership check.
   */
  private async decide(
    user: AuthenticatedUser,
    id: string,
    next: EventStatus,
    reasonFields: {
      decisionReason?: string | null;
      clarificationRequest?: string | null;
    },
  ): Promise<CoordinatorRequestView> {
    const event = await this.access.assertEventAccess(user, id, Action.REVIEW);

    this.assertIsAssignedTo(user, event);

    const decided = await this.prisma.$transaction(async (tx) => {
      await tx.eventRequest.update({
        where: { id: event.id },
        data: reasonFields,
      });

      return this.setStatus(event, next, tx);
    });

    return this.toOrganiserView(decided);
  }

  /**
   * US-07 — reviewing requires being the assigned Coordinator, not merely
   * able to see the request.
   *
   * The ASSIGNED scope also admits the unassigned review pool (US-03 AC-2), so
   * scope alone would let any Coordinator approve a request nobody owns. US-10
   * exists to establish that ownership first.
   */
  private assertIsAssignedTo(
    user: AuthenticatedUser,
    event: EventRequest,
  ): void {
    if (event.coordinatorId === null) {
      throw new ConflictException(
        'assign a coordinator to this request before reviewing it',
      );
    }

    if (!this.access.isAssignedCoordinator(user, event)) {
      throw new ForbiddenException(
        'only the assigned coordinator may review this request',
      );
    }
  }

  /**
   * US-10 — link a Coordinator to an event as its main point of contact.
   *
   * Assignment is deliberately NOT a status change: AC-1 asks only that the
   * Coordinator be linked, and moving SUBMITTED -> UNDER_REVIEW here would be
   * inventing review behaviour this story does not describe. setStatus() is
   * therefore not called, and the event's status is left exactly as found.
   *
   * AC-2 falls out of the single coordinatorId column: assigning a new
   * Coordinator is what removes the previous one's ownership, so the two can
   * never disagree.
   */
  async assignCoordinator(
    user: AuthenticatedUser,
    eventId: string,
    dto: AssignCoordinatorDto,
  ): Promise<EventRequest> {
    const event = await this.access.assertEventAccess(
      user,
      eventId,
      Action.ASSIGN,
    );

    if (!ASSIGNABLE_STATUSES.includes(event.status)) {
      throw new ConflictException(
        `a coordinator cannot be assigned while the request is ${event.status}`,
      );
    }

    await this.assertIsCoordinator(dto.coordinatorId);

    return this.prisma.eventRequest.update({
      where: { id: event.id },
      data: { coordinatorId: dto.coordinatorId },
      include: COORDINATOR_SELECT,
    });
  }

  /**
   * The target must exist and actually hold the Coordinator role — otherwise
   * an event could be handed to an Attendee, who would then be unable to see
   * it at all.
   */
  private async assertIsCoordinator(userId: string): Promise<void> {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!target) {
      throw new NotFoundException('coordinator not found');
    }

    if (target.role !== Role.EVENT_COORDINATOR) {
      throw new BadRequestException(
        'the assigned user must have the EVENT_COORDINATOR role',
      );
    }
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

  /**
   * US-05 — the Organiser's own requests with their current status.
   *
   * Strictly read-only: this method owns no transition logic and never writes.
   * The status it reports is whatever setStatus() last committed (AC-4), and
   * decisionReason / clarificationRequest are surfaced as the review story
   * wrote them (AC-2, AC-3).
   *
   * Ownership comes from the same scopedEventFilter the rest of the module
   * uses, so AC-5 is enforced by the shared access layer rather than by a
   * second, divergent rule here.
   */
  async findMyRequests(user: AuthenticatedUser): Promise<OrganiserRequestView[]> {
    const events = await this.prisma.eventRequest.findMany({
      where: this.access.scopedEventFilter(user, Action.READ),
      orderBy: { createdAt: 'desc' },
      include: COORDINATOR_SELECT,
    });

    return events.map((event) => this.toOrganiserView(event));
  }

  /** US-05 — a single request of the Organiser's, with ownership enforced. */
  async findMyRequest(
    user: AuthenticatedUser,
    id: string,
  ): Promise<OrganiserRequestView> {
    await this.access.assertEventAccess(user, id, Action.READ);

    // Re-read with contacts and the clarification thread (US-09 AC-5).
    const event = await this.prisma.eventRequest.findUniqueOrThrow({
      where: { id },
      include: { ...EVENT_CONTACTS_INCLUDE, ...CLARIFICATION_THREAD_INCLUDE },
    });

    return this.toOrganiserView(event);
  }

  /**
   * US-11 — attaches the consolidated status view. Derived on every read, so
   * it always reflects what setStatus() last committed (AC-3).
   */
  private toOrganiserView(event: EventRequest): OrganiserRequestView {
    const view = buildStatusView(event);

    return {
      ...event,
      statusView: view,
      // Kept flat for the callers established in US-05 and US-09.
      clarificationRequested: view.clarificationRequested,
    };
  }

  /** AC-4 / US-02 AC-5,6 — scoped list; the server decides what is visible. */
  async findAllForUser(
    user: AuthenticatedUser,
  ): Promise<(EventRequest | PublicEventView)[]> {
    const events = await this.prisma.eventRequest.findMany({
      where: this.access.scopedEventFilter(user),
      orderBy: { createdAt: 'desc' },
      include: COORDINATOR_SELECT,
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
