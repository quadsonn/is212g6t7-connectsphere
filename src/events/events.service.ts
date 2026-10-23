import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  BookingStatus,
  ChangeRequestStatus,
  ConfirmedArrangement,
  EventChange,
  EventRequest,
  EventStatus,
  NotificationType,
  Prisma,
  RegistrationStatus,
  ReservationStatus,
  Role,
  SafetyOutcome,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  AccessControlService,
  EventWithCoordinator,
  PublicEventView,
  PUBLIC_VENUE_INCLUDE,
} from '../common/access/access-control.service';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { ArrangementsRegistry } from '../common/arrangements/arrangements.registry';
import {
  EquipmentReservationsService,
  UnavailableReservation,
} from '../equipment/equipment-reservations.service';
import { AttendeeChangeNotifier } from '../notifications/attendee-change-notifier.service';
import { scheduleChangesFrom } from '../notifications/event-schedule-change';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsRequestNotifier } from './events-request-notifier.service';
import { PrismaService } from '../prisma/prisma.service';
import { AskClarificationDto } from './dto/ask-clarification.dto';
import { CreateEventRequestDto } from './dto/create-event-request.dto';
import { RespondClarificationDto } from './dto/respond-clarification.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { ReturnRequestDto } from './dto/return-request.dto';
import { DraftEventRequestDto } from './dto/draft-event-request.dto';
import { UpdatePlanningDto } from './dto/update-planning.dto';
import { TechnicalRequirementsDto } from './dto/technical-requirements.dto';
import {
  affectedArrangements,
  describeRequirement,
  diffEventFields,
  FieldChange,
  sameValue,
} from './event-change.rules';
import {
  buildStatusView,
  canTransition,
  EDITABLE_STATUSES,
  EventStatusView,
  PLANNING_STATUSES,
  REVIEW_REJECTION_STATUSES,
  RESUMABLE_PLANNING_STATUSES,
} from './event-status.machine';
import { BookingsService } from '../bookings/bookings.service';
import { evaluateRegistration } from '../registrations/registration-rules';
import { CHANGE_REQUEST_INCLUDE } from './events-change-request.service';
import { inEntryOrder } from '../prisma/readable-id';


/** US-42 — a free-text equipment line is "unchanged" when all three match. */
const freeTextKey = (line: { equipmentType: string; quantity: number; notes: string | null }) =>
  JSON.stringify([line.equipmentType, line.quantity, line.notes]);

/**
 * US-20 — statuses in which an event has no use for a venue: not yet a
 * request, turned down, or over.
 */
const INACTIVE_FOR_BOOKING: EventStatus[] = [
  EventStatus.DRAFT,
  EventStatus.REJECTED,
  EventStatus.CANCELLED,
  EventStatus.COMPLETED,
];

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

/**
 * US-28 — the event's equipment requirements, in the order they were listed.
 * Rows of one save share a createdAt, so the ID number breaks the tie. The
 * database orders IDs as text, which goes wrong past 999 (REQ-1000 before
 * REQ-999), so every read re-sorts with inEntryOrder() (prisma/readable-id.ts).
 */
const REQUIREMENTS_ORDER: Prisma.EquipmentRequirementOrderByWithRelationInput[] = [
  { createdAt: 'asc' },
  { id: 'asc' },
];

export const REQUIREMENTS_INCLUDE = {
  equipmentRequirements: { orderBy: REQUIREMENTS_ORDER },
};

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
  /**
   * US-37 — the undecided change request, shown beside the original details
   * (which are untouched). Set on single-event reads only.
   */
  pendingChangeRequest?: PendingChangeRequest | null;
  /**
   * US-38 AC-5 — the most recent decided change request, so a rejection's
   * reason is visible to the Organiser.
   */
  latestChangeDecision?: PendingChangeRequest | null;
  /**
   * Upcoming equipment the event requested or reserved that is no longer
   * available (the item was taken out of service). An indicator that something
   * needs attention; empty when all is well. Set on single-event reads only.
   */
  unavailableEquipment?: UnavailableReservation[];
};

/** US-37 — a change request with its equipment resolved to catalogue names. */
export type PendingChangeRequest = Prisma.EventChangeRequestGetPayload<{
  include: typeof CHANGE_REQUEST_INCLUDE;
}>;

/** What GET /events/:id returns: the event, or its public projection. */
export type EventDetailView =
  | (EventWithCoordinator & {
      pendingChangeRequest?: PendingChangeRequest | null;
      latestChangeDecision?: PendingChangeRequest | null;
    })
  | PublicEventView;

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

/** US-26 AC-2 — who made a change, resolved from the id. */
const CHANGED_BY_SELECT = {
  changedBy: { select: { id: true, name: true, email: true, role: true } },
} as const;

/** US-26 — one history entry as returned to the client. */
export type EventChangeEntry = Omit<EventChange, 'changes'> & {
  changes: FieldChange[];
  changedBy: { id: string; name: string; email: string; role: Role };
};

/** US-26 AC-1/AC-3 — the history, plus an explicit "nothing recorded" signal. */
export interface EventChangeHistory {
  eventId: string;
  entries: EventChangeEntry[];
  /** AC-3: set only when there are no entries. */
  message: string | null;
}

/**
 * US-25 — the result of a planning edit: the saved event (AC-1, AC-3) plus
 * what was recorded for it. `change` is null when the payload altered
 * nothing, in which case no history entry is written.
 */
export type PlanningUpdateResult = CoordinatorRequestView & {
  change: EventChangeEntry | null;
};

export const NO_CHANGES_MESSAGE =
  'No changes have been recorded for this event since it was created.';

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
    private readonly equipmentReservations: EquipmentReservationsService,
    private readonly bookings: BookingsService,
    // Requirement change 6: tells the Safety check that requirements changed.
    @Optional() private readonly arrangements?: ArrangementsRegistry,
    // Tells registered Attendees when a date or time change is applied.
    @Optional() private readonly attendeeChanges?: AttendeeChangeNotifier,
    // Tells Coordinator Leads when a request is submitted or resubmitted.
    @Optional() private readonly requestNotifier?: EventsRequestNotifier,
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

    const submitted = await this.prisma.$transaction(async (tx) => {
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

    // AC-1: tell the Coordinator Leads, after the submission has committed.
    await this.requestNotifier?.submitted(submitted);
    return submitted;
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
   *
   * US-26: once a request has been submitted and handed back (RETURNED), the
   * Organiser's amendments are changes to a real event and go in its history.
   * Edits to a never-submitted DRAFT are still authoring, and are not
   * recorded — "no changes since creation" would otherwise never be true.
   */
  async updateDraft(
    user: AuthenticatedUser,
    id: string,
    dto: DraftEventRequestDto,
  ): Promise<EventRequest> {
    const event = await this.access.assertEventAccess(user, id, Action.UPDATE);

    this.assertIsEditable(event);

    const fields = this.draftFields(dto);

    if (event.status === EventStatus.DRAFT) {
      return this.prisma.eventRequest.update({
        where: { id: event.id },
        data: fields,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.eventRequest.update({
        where: { id: event.id },
        data: fields,
      });

      const changes = diffEventFields(event, fields);
      if (changes.length > 0) {
        await this.recordChange(tx, event.id, user.userId, changes, []);
      }

      return updated;
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

    const submitted = await this.setStatus(event, EventStatus.SUBMITTED);
    // AC-1: a first submission or a resubmission both reach the Leads here.
    await this.requestNotifier?.submitted(submitted);
    return submitted;
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
   * US-20 — the requirements a venue is checked against, for an event this
   * Coordinator is assigned to and could still book a venue for.
   *
   * Narrower than the ASSIGNED read scope on purpose: that scope includes the
   * unassigned review pool, but booking arrangements belong to the event's own
   * Coordinator (CLAUDE.md §1). Anything outside that answers 404, so the
   * event's existence is not confirmed to someone who may not plan it.
   */
  async findSuitabilityRequirements(user: AuthenticatedUser, id: string) {
    const event = await this.prisma.eventRequest.findFirst({
      where: {
        AND: [
          this.access.scopedEventFilter(user, Action.READ),
          {
            id,
            coordinatorId: user.userId,
            status: { notIn: INACTIVE_FOR_BOOKING },
          },
        ],
      },
      select: {
        id: true,
        expectedAttendance: true,
        accessibilityRequirements: true,
        preferredLayout: true,
      },
    });

    if (!event) {
      throw new NotFoundException('event not found');
    }

    return event;
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
      include: {
        ...EVENT_CONTACTS_INCLUDE,
        ...CLARIFICATION_THREAD_INCLUDE,
        ...REQUIREMENTS_INCLUDE,
      },
    });

    // US-28: the requirements in the order they were listed.
    const inOrder = { ...event, equipmentRequirements: inEntryOrder(event.equipmentRequirements) };
    return {
      ...this.toOrganiserView(inOrder),
      unavailableEquipment: await this.equipmentReservations.findUnavailableForEvent(id),
    };
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

    // setStatus() treats APPROVED -> APPROVED as a no-op, so a repeated click
    // is not a second decision and must not produce a second notification.
    if (event.status !== EventStatus.APPROVED) {
      await this.notifyOrganiserOfDecision(event, 'approved');
    }

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
      // US: the Organiser sees the question itself, not just that one exists.
      message: `The coordinator has asked a question about "${event.name ?? 'your event request'}". Reason: ${dto.question}`,
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
    return this.decide(
      user,
      id,
      EventStatus.REJECTED,
      {
        decisionReason: dto.reason,
        // A rejection supersedes any outstanding question.
        clarificationRequest: null,
      },
      // US-47 opened REJECTED to events being arranged; this review rejection
      // stays limited to the statuses it always could reject from.
      REVIEW_REJECTION_STATUSES,
    );
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
    allowedFrom?: readonly EventStatus[],
  ): Promise<CoordinatorRequestView> {
    const event = await this.access.assertEventAccess(user, id, Action.REVIEW);

    this.assertIsAssignedTo(user, event);

    // Same refusal setStatus() gives for an edge it does not allow. A repeat of
    // the decision the event already has is not refused here: it goes on to
    // the usual idempotent path, which changes nothing and notifies no one.
    if (allowedFrom && event.status !== next && !allowedFrom.includes(event.status)) {
      throw new ConflictException(`cannot change status from ${event.status} to ${next}`);
    }

    const decided = await this.prisma.$transaction(async (tx) => {
      await tx.eventRequest.update({
        where: { id: event.id },
        data: reasonFields,
      });

      return this.setStatus(event, next, tx);
    });

    if (event.status !== next) {
      await this.notifyOrganiserOfDecision(
        event,
        next === EventStatus.REJECTED ? 'rejected' : 'returned for amendment',
        reasonFields.decisionReason ?? reasonFields.clarificationRequest ?? null,
      );
    }

    return this.toOrganiserView(decided);
  }

  /**
   * The Organiser is told what the Coordinator decided on their request: the
   * event, the outcome, and the Coordinator's reason where one was given. Only
   * ever the owning Organiser — never the assignee, other Coordinators or
   * Attendees — and raised after the decision commits, best-effort like every
   * other notification (see NotificationsService). Event-detail link: the
   * notification records relatedEventId, which the inbox turns into the
   * Organiser's event page (notification-view.ts linkFor).
   *
   * Clarification has its own sender (askClarification, which keeps its type);
   * approve, reject and return share EVENT_STATUS_CHANGED.
   */
  private async notifyOrganiserOfDecision(
    event: EventRequest,
    outcome: 'approved' | 'rejected' | 'returned for amendment',
    reason: string | null = null,
  ): Promise<void> {
    const name = event.name ?? 'your event request';
    const suffix = reason ? ` Reason: ${reason}` : '';

    await this.notifications.notifySafely({
      recipientId: event.organiserId,
      type: NotificationType.EVENT_STATUS_CHANGED,
      message: `Your event request "${name}" was ${outcome}.${suffix}`,
      relatedEventId: event.id,
    });
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
   * US-25 prerequisite — APPROVED -> PLANNING.
   *
   * The transition was already in the table, but no route reached it, so no
   * event could ever be "in planning" for AC-1 to apply to. The assigned
   * Coordinator starts planning once they begin arranging the event.
   */
  async startPlanning(
    user: AuthenticatedUser,
    id: string,
  ): Promise<CoordinatorRequestView> {
    const event = await this.access.assertEventAccess(user, id, Action.UPDATE);

    this.assertIsAssignedTo(user, event);

    // Idempotent while already planning; otherwise only from the statuses that
    // lead back into planning. A Coordinator cannot pull an event out of a
    // pending safety check this way.
    if (
      event.status !== EventStatus.PLANNING &&
      !RESUMABLE_PLANNING_STATUSES.includes(event.status)
    ) {
      throw new ConflictException(
        `planning cannot be started while the event is ${event.status}`,
      );
    }

    return this.toOrganiserView(
      await this.setStatus(event, EventStatus.PLANNING),
    );
  }

  /**
   * US-25 AC-1/AC-2 — the Coordinator updates an event during planning.
   *
   * AC-1: only the keys sent are written, and only when the event is in a
   * PLANNING_STATUSES status and assigned to this Coordinator.
   *
   * AC-2: if a changed field feeds an arrangement that has already been
   * approved (ARRANGEMENT_SENSITIVE_FIELDS), the history entry is flagged
   * requiresReview with the arrangements affected. The change is still saved
   * — AC-3 requires the latest information to be what everyone sees — but it
   * is distinguishable from an ordinary edit, both in the response and in the
   * US-26 history.
   *
   * AMBIGUOUS: AC-2 does not say who performs the review or how the flag is
   * cleared. Neither is built; the booking/reservation stories (E5/E6) own
   * re-deciding an arrangement. See the US-25 summary.
   *
   * AC-3 needs no extra machinery: every read path loads the row fresh, so
   * the committed values are what any permitted user sees next.
   */
  async updateDuringPlanning(
    user: AuthenticatedUser,
    id: string,
    dto: UpdatePlanningDto,
  ): Promise<PlanningUpdateResult> {
    const event = await this.access.assertEventAccess(user, id, Action.UPDATE);

    this.assertIsAssignedTo(user, event);
    this.assertInPlanning(event);
    this.assertDatesInOrder(event, dto);

    const changes = diffEventFields(event, dto);

    if (changes.length === 0) {
      return { ...(await this.findAssignedRequest(user, id)), change: null };
    }

    const affected = affectedArrangements(
      changes,
      await this.confirmedArrangements(event.id),
    );

    // Only the fields that actually changed are written.
    const data = Object.fromEntries(
      changes.map(({ field }) => [field, dto[field]]),
    ) as Prisma.EventRequestUpdateInput;

    const change = await this.prisma.$transaction(async (tx) => {
      await tx.eventRequest.update({ where: { id: event.id }, data });

      return this.recordChange(tx, event.id, user.userId, changes, affected);
    });

    // A new date or time is the Attendees' business; other edits are not.
    await this.attendeeChanges?.notifyRegisteredAttendees(
      event,
      scheduleChangesFrom(changes),
    );

    return { ...(await this.findAssignedRequest(user, id)), change };
  }

  /**
   * US-28 AC-1/AC-2 — record the equipment (type and quantity) and technical
   * support an event in planning needs, for Technical Support to review.
   *
   * The equipment list is replaced wholesale: it is edited as one table, so
   * "what was saved" is the list the Coordinator is looking at. Rows are
   * only rewritten when the list actually differs.
   *
   * Both parts go through the US-26 history, and — like any planning edit —
   * are flagged for review (US-25 AC-2) if an equipment reservation has
   * already been approved against the previous requirements.
   */
  async setTechnicalRequirements(
    user: AuthenticatedUser,
    id: string,
    dto: TechnicalRequirementsDto,
  ): Promise<PlanningUpdateResult> {
    const event = await this.access.assertEventAccess(user, id, Action.UPDATE);

    this.assertIsAssignedTo(user, event);
    this.assertInPlanning(event);

    const catalogueTypes = await this.catalogueTypes(dto.equipment ?? []);

    const incoming = dto.equipment?.map((item) => ({
      // US-37: a catalogue-linked line is named by the catalogue.
      equipmentType: item.equipmentId
        ? (catalogueTypes.get(item.equipmentId) as string)
        : item.equipmentType.trim(),
      quantity: item.quantity,
      notes: item.notes?.trim() || null,
      ...(item.equipmentId ? { equipmentId: item.equipmentId } : {}),
    }));

    if (incoming) {
      this.assertNoDuplicateTypes(incoming);
    }

    const changes: FieldChange[] = [];

    if (incoming) {
      const current = inEntryOrder(
        await this.prisma.equipmentRequirement.findMany({
          where: { eventId: event.id },
          orderBy: REQUIREMENTS_ORDER,
        }),
      );
      const previous = current.map(describeRequirement);
      const next = incoming.map(describeRequirement);

      if (!sameValue(previous, next)) {
        changes.push({ field: 'equipmentRequirements', previous, next });
      }
    }

    if (dto.technicalSupportNeeds !== undefined) {
      const previous = event.technicalSupportNeeds;
      const next = dto.technicalSupportNeeds?.trim() || null;

      if (previous !== next) {
        changes.push({ field: 'technicalSupportNeeds', previous, next });
      }
    }

    if (changes.length === 0) {
      return { ...(await this.findAssignedRequest(user, id)), change: null };
    }

    const affected = affectedArrangements(
      changes,
      await this.confirmedArrangements(event.id),
    );

    const change = await this.prisma.$transaction(async (tx) => {
      if (incoming && changes.some((c) => c.field === 'equipmentRequirements')) {
        // US-42: a free-text line the Coordinator already checked by hand
        // keeps its tick if it comes back unchanged; a changed or new line
        // has to be checked again.
        const ticked = new Map(
          (
            await tx.equipmentRequirement.findMany({
              where: { eventId: event.id, equipmentId: null, manuallyConfirmedAt: { not: null } },
            })
          ).map((row) => [freeTextKey(row), row]),
        );

        await tx.equipmentRequirement.deleteMany({ where: { eventId: event.id } });
        await tx.equipmentRequirement.createMany({
          data: incoming.map((item) => {
            const kept = item.equipmentId ? undefined : ticked.get(freeTextKey(item));
            return {
              ...item,
              eventId: event.id,
              ...(kept
                ? {
                    manuallyConfirmedAt: kept.manuallyConfirmedAt,
                    manuallyConfirmedById: kept.manuallyConfirmedById,
                  }
                : {}),
            };
          }),
        });
      }

      const support = changes.find((c) => c.field === 'technicalSupportNeeds');
      if (support) {
        await tx.eventRequest.update({
          where: { id: event.id },
          data: { technicalSupportNeeds: support.next as string | null },
        });
      }

      return this.recordChange(tx, event.id, user.userId, changes, affected);
    });

    // The equipment asked for may now be more or less than what is reserved.
    await this.arrangements?.notifyChanged(event.id);

    return { ...(await this.findAssignedRequest(user, id)), change };
  }

  /** US-37 — catalogue names for the lines that name an item; 400 on an unknown id. */
  private async catalogueTypes(
    items: { equipmentId?: string }[],
  ): Promise<Map<string, string>> {
    const ids = [
      ...new Set(items.flatMap((item) => (item.equipmentId ? [item.equipmentId] : []))),
    ];
    if (ids.length === 0) {
      return new Map();
    }

    const found = await this.prisma.equipment.findMany({
      where: { id: { in: ids } },
      select: { id: true, type: true },
    });
    const types = new Map(found.map((row) => [row.id, row.type]));
    const unknown = ids.filter((id) => !types.has(id));

    if (unknown.length > 0) {
      throw new BadRequestException(
        unknown.map((id) => `equipment item ${id} is not in the catalogue`),
      );
    }

    return types;
  }

  /**
   * One line per type: "2 × Projector" and "1 × projector" side by side would
   * leave Technical Support guessing whether the event needs two or three.
   */
  private assertNoDuplicateTypes(items: { equipmentType: string }[]): void {
    const seen = new Set<string>();

    for (const { equipmentType } of items) {
      const key = equipmentType.toLowerCase();
      if (seen.has(key)) {
        throw new BadRequestException([
          `equipmentType "${equipmentType}" is listed more than once; combine the quantities`,
        ]);
      }
      seen.add(key);
    }
  }

  /** US-25/US-28 AC "is planning an event". */
  private assertInPlanning(event: EventRequest): void {
    if (!PLANNING_STATUSES.includes(event.status)) {
      throw new ConflictException(
        `event is ${event.status}; information can only be updated during planning`,
      );
    }
  }

  /**
   * US-26 AC-1/AC-2/AC-3 — the event's change history, oldest first.
   *
   * Read access is the same EVENT/READ the Coordinator detail view uses, so
   * the history is visible exactly where the event is.
   */
  async getChangeHistory(
    user: AuthenticatedUser,
    id: string,
  ): Promise<EventChangeHistory> {
    await this.access.assertEventAccess(user, id, Action.READ);

    const rows = await this.prisma.eventChange.findMany({
      where: { eventId: id },
      // id breaks ties between two saves in the same millisecond.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: CHANGED_BY_SELECT,
    });

    const entries = rows.map((row) => this.toChangeEntry(row));

    return {
      eventId: id,
      entries,
      message: entries.length === 0 ? NO_CHANGES_MESSAGE : null,
    };
  }

  /**
   * Arrangements this event has had approved. REQUESTED ones are not yet
   * confirmed, and REJECTED ones depend on nothing (AC-2 "already confirmed").
   */
  async confirmedArrangements(
    eventId: string,
  ): Promise<ConfirmedArrangement[]> {
    const [bookings, reservations] = await Promise.all([
      this.prisma.venueBooking.count({
        where: { eventId, status: BookingStatus.APPROVED },
      }),
      this.prisma.equipmentReservation.count({
        where: { eventId, status: ReservationStatus.APPROVED },
      }),
    ]);

    return [
      ...(bookings > 0 ? [ConfirmedArrangement.VENUE_BOOKING] : []),
      ...(reservations > 0 ? [ConfirmedArrangement.EQUIPMENT_RESERVATION] : []),
    ];
  }

  /**
   * End must stay after start, judged against the stored value of whichever
   * one was not sent. The DTO cannot do this alone: it never sees the stored
   * row, so moving only the start past the existing end would slip through.
   */
  private assertDatesInOrder(event: EventRequest, dto: UpdatePlanningDto): void {
    const start = dto.proposedStart ?? event.proposedStart;
    const end = dto.proposedEnd ?? event.proposedEnd;

    if (start && end && end.getTime() <= start.getTime()) {
      throw new BadRequestException([
        'proposedEnd must be later than proposedStart',
      ]);
    }
  }

  /**
   * US-26 — appends one entry to the event's history. Public so the change
   * request review (US-38) records an approval through the same path.
   */
  async recordChange(
    tx: Prisma.TransactionClient,
    eventId: string,
    changedById: string,
    changes: FieldChange[],
    affected: ConfirmedArrangement[],
  ): Promise<EventChangeEntry> {
    const row = await tx.eventChange.create({
      data: {
        eventId,
        changedById,
        changes: changes as unknown as Prisma.InputJsonValue,
        requiresReview: affected.length > 0,
        affectedArrangements: affected,
      },
      include: CHANGED_BY_SELECT,
    });

    return this.toChangeEntry(row);
  }

  private toChangeEntry(
    row: EventChange & { changedBy: EventChangeEntry['changedBy'] },
  ): EventChangeEntry {
    return { ...row, changes: row.changes as unknown as FieldChange[] };
  }

  /**
   * THE status transition method. Nothing in the codebase may write
   * EventRequest.status directly — every change comes through here so the
   * transition table is enforced in one place (CLAUDE.md §3.4).
   *
   * Later stories (review, planning, cancellation) call this rather than
   * adding their own update statements.
   *
   * US-33 AC-1 / US-44: reaching CANCELLED releases the event's equipment
   * reservations and venue bookings in the same transaction as the status
   * change — whichever path cancels the event (US-43 will add one), and with
   * no window in which the event is cancelled but its equipment or venues
   * still held. If either release fails, the cancellation rolls back with it.
   * `actorId`, when given, is recorded on each released booking's history.
   *
   * US-42 AC-4: a move to AWAITING_SAFETY_CHECK is the Coordinator confirming
   * the arrangements, so it also records when and by whom (`actorId`). Other
   * transitions record no actor; their stories keep their own trail.
   */
  async setStatus(
    event: EventRequest,
    next: EventStatus,
    tx?: Prisma.TransactionClient,
    actorId?: string,
  ): Promise<EventRequest> {
    if (event.status === next) {
      return event;
    }

    if (!canTransition(event.status, next)) {
      throw new ConflictException(
        `cannot change status from ${event.status} to ${next}`,
      );
    }

    // Requirement change 6: the state machine has no way into CONFIRMED except
    // from AWAITING_SAFETY_CHECK; this is the second lock. Whatever path asks,
    // an event is only confirmed while its latest safety review is an approval.
    if (next === EventStatus.CONFIRMED) {
      await this.assertSafetyApproved(event.id, tx ?? this.prisma);
    }

    // The status write and the release must commit together; open a
    // transaction if the caller did not supply one.
    if (next === EventStatus.CANCELLED && !tx) {
      return this.prisma.$transaction((inner) =>
        this.setStatus(event, next, inner, actorId),
      );
    }

    const client = tx ?? this.prisma;

    let updated = await client.eventRequest.update({
      where: { id: event.id },
      data: {
        status: next,
        // Lead assignment story: the queue is ordered by when a request was
        // submitted, and every route into SUBMITTED comes through here.
        ...(next === EventStatus.SUBMITTED ? { submittedAt: new Date() } : {}),
        // Requirement change 6: the Safety queue lists longest-waiting first.
        ...(next === EventStatus.AWAITING_SAFETY_CHECK
          ? { safetyQueuedAt: new Date() }
          : {}),
      },
    });

    // Kept apart from the status write above, which events-status-audit.spec
    // pins to exactly `{ status: next }`. Callers confirming pass a
    // transaction, so the two commit together.
    if (next === EventStatus.AWAITING_SAFETY_CHECK) {
      updated = await client.eventRequest.update({
        where: { id: event.id },
        data: {
          arrangementsConfirmedAt: new Date(),
          arrangementsConfirmedById: actorId ?? null,
        },
      });
    }

    if (next === EventStatus.CANCELLED) {
      await this.equipmentReservations.releaseForCancelledEvent(
        event.id,
        client,
      );
      // US-44 (with US-40 AC-1's notice to each venue's manager).
      await this.bookings.releaseForCancelledEvent(event.id, client, actorId ?? null);
    }

    return updated;
  }

  /**
   * Requirement change 6 — an event may be confirmed only while its most
   * recent safety review is an approval. A rejection or a request for changes
   * after an earlier approval therefore re-blocks it.
   */
  private async assertSafetyApproved(
    eventId: string,
    client: Prisma.TransactionClient | PrismaService,
  ): Promise<void> {
    const latest = await client.safetyReview.findFirst({
      where: { eventId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { outcome: true },
    });

    if (latest?.outcome !== SafetyOutcome.APPROVED) {
      throw new ConflictException(
        'this event cannot be confirmed without an approved safety check',
      );
    }
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
      // US-37: the equipment lines travel with the view so the change request
      // form can show what the event currently has.
      include: {
        ...EVENT_CONTACTS_INCLUDE,
        ...CLARIFICATION_THREAD_INCLUDE,
        ...REQUIREMENTS_INCLUDE,
      },
    });

    // US-28: the requirements in the order they were listed.
    const inOrder = { ...event, equipmentRequirements: inEntryOrder(event.equipmentRequirements) };
    return {
      ...this.toOrganiserView(inOrder),
      pendingChangeRequest: await this.findPendingChangeRequest(id),
      latestChangeDecision: await this.findLatestChangeDecision(id),
      unavailableEquipment: await this.equipmentReservations.findUnavailableForEvent(id),
    };
  }

  /** US-38 AC-5 — the event's most recently decided change request, or null. */
  private findLatestChangeDecision(eventId: string) {
    return this.prisma.eventChangeRequest.findFirst({
      where: {
        eventId,
        status: { in: [ChangeRequestStatus.APPROVED, ChangeRequestStatus.REJECTED] },
      },
      orderBy: { decidedAt: 'desc' },
      include: CHANGE_REQUEST_INCLUDE,
    });
  }

  /** US-37 — the event's undecided change request, or null. */
  private findPendingChangeRequest(eventId: string) {
    return this.prisma.eventChangeRequest.findFirst({
      where: { eventId, status: ChangeRequestStatus.PENDING },
      include: CHANGE_REQUEST_INCLUDE,
    });
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
  ): Promise<(EventWithCoordinator | PublicEventView)[]> {
    const events = await this.prisma.eventRequest.findMany({
      where: this.access.scopedEventFilter(user),
      orderBy: { createdAt: 'desc' },
      // Attendees also get the confirmed venue (US-10 "where"); other roles
      // reach bookings through the bookings module, so their shape is unchanged.
      include:
        user.role === Role.ATTENDEE
          ? { ...COORDINATOR_SELECT, ...PUBLIC_VENUE_INCLUDE }
          : COORDINATOR_SELECT,
    });

    const visible =
      user.role === Role.ATTENDEE
        ? await this.onlyRegistrable(user, events)
        : events;

    return visible.map((event) => this.access.projectEvent(user, event));
  }

  /**
   * An Attendee's list is the events they could still take part in:
   * CONFIRMED, with registration enabled, not yet started, whose registration
   * period has not ended, and not already registered by them.
   *
   * Events that are not yet open or full stay in the list on purpose. The
   * Register option is disabled for them with the reason and the open and
   * close times beside it (GET /registrations/events/:id/options), and the
   * Register endpoint refuses them regardless. An event whose registration
   * has closed is over for the Attendee, so it is left out rather than listed.
   */
  private async onlyRegistrable<T extends EventWithCoordinator>(
    user: AuthenticatedUser,
    events: T[],
  ): Promise<T[]> {
    const now = new Date();
    const candidates = events.filter(
      (event) =>
        event.status === EventStatus.CONFIRMED &&
        event.registrationEnabled &&
        (event.proposedStart === null || event.proposedStart > now) &&
        // The headcount does not matter here: CLOSED is decided before FULL.
        evaluateRegistration(event, 0, now).block !== 'CLOSED',
    );
    if (candidates.length === 0) {
      return [];
    }

    const mine = await this.prisma.registration.findMany({
      where: {
        eventId: { in: candidates.map((event) => event.id) },
        attendeeId: user.userId,
        status: RegistrationStatus.REGISTERED,
      },
      select: { eventId: true },
    });
    const alreadyMine = new Set(mine.map((row) => row.eventId));

    return candidates.filter((event) => !alreadyMine.has(event.id));
  }

  /**
   * AC-4 — the Organiser sees every detail they entered plus current status.
   * Ownership is enforced before anything is returned.
   */
  async findOneForUser(
    user: AuthenticatedUser,
    id: string,
  ): Promise<EventDetailView> {
    const event = await this.access.assertEventAccess(user, id, Action.READ);

    // US-28 AC-3: Technical Support (and every other full-record reader)
    // sees the recorded requirements. The Attendee projection rebuilds the
    // record from an explicit field list, so they are dropped there.
    const equipmentRequirements = inEntryOrder(
      await this.prisma.equipmentRequirement.findMany({
        where: { eventId: event.id },
        orderBy: REQUIREMENTS_ORDER,
      }),
    );

    // US-10 — an Attendee opening one event also sees its confirmed venue.
    // Loaded only for them: assertEventAccess resolves the coordinator, not
    // bookings, and other roles do not receive the public projection here.
    const venueBookings =
      user.role === Role.ATTENDEE
        ? await this.prisma.venueBooking.findMany({
            where: { eventId: event.id, status: BookingStatus.APPROVED },
            orderBy: { start: 'asc' },
            take: 1,
            select: { venue: { select: { id: true, name: true, location: true } } },
          })
        : undefined;

    const withRequirements = {
      ...event,
      equipmentRequirements,
      ...(venueBookings ? { venueBookings } : {}),
    };
    const projected = this.access.projectEvent(user, withRequirements);

    // US-37: the Organiser sees their pending change request beside the
    // original details. Nobody else's view carries it.
    if (user.role === Role.EVENT_ORGANISER) {
      return {
        ...(projected as EventWithCoordinator),
        pendingChangeRequest: await this.findPendingChangeRequest(event.id),
        latestChangeDecision: await this.findLatestChangeDecision(event.id),
      };
    }

    return projected;
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
