import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AskClarificationDto } from './dto/ask-clarification.dto';
import { CreateEventRequestDto } from './dto/create-event-request.dto';
import { RespondClarificationDto } from './dto/respond-clarification.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { RejectUnfulfillableDto } from './dto/reject-unfulfillable.dto';
import { ReturnRequestDto } from './dto/return-request.dto';
import { DraftEventRequestDto } from './dto/draft-event-request.dto';
import { UpdatePlanningDto } from './dto/update-planning.dto';
import { TechnicalRequirementsDto } from './dto/technical-requirements.dto';
import { AssignTechnicalSupportDto } from './dto/assign-technical-support.dto';
import { CancelEventDto } from './dto/cancel-event.dto';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { RejectChangeRequestDto } from './dto/reject-change-request.dto';
import { EventsCancellationService } from './events-cancellation.service';
import { EventsChangeReviewService } from './events-change-review.service';
import { EventsChangeRequestService } from './events-change-request.service';
import { EventConfirmationService } from './event-confirmation.service';
import { EventsService } from './events.service';
import { EventsTechnicalSupportService } from './events-technical-support.service';
import { EventsUnfulfillableService } from './events-unfulfillable.service';

/**
 * Guard order: JwtAuthGuard establishes the principal, RolesGuard applies the
 * declared role or permission. Record-level ownership is enforced in the
 * service via AccessControlService.
 */
@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly changeRequests: EventsChangeRequestService,
    private readonly changeReviews: EventsChangeReviewService,
    private readonly unfulfillable: EventsUnfulfillableService,
    private readonly confirmation: EventConfirmationService,
    private readonly cancellation: EventsCancellationService,
    private readonly technicalSupport: EventsTechnicalSupportService,
  ) {}

  /**
   * US-03 — submit a new event request (AC-1, AC-2, AC-5).
   *
   * 201 with the created record is the confirmation AC-2 asks for: the
   * Organiser receives the persisted request, including its id and SUBMITTED
   * status, rather than a bare acknowledgement.
   *
   * Restricted with @Roles as the story specifies. The matrix still grants
   * EVENT/CREATE to this role, and a test asserts the two agree so the literal
   * list here cannot drift from PERMISSIONS.
   */
  @Post()
  @Roles(Role.EVENT_ORGANISER)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEventRequestDto,
  ) {
    return this.eventsService.createAndSubmit(user, dto);
  }

  /**
   * US-04 AC-1 — save a partial draft.
   *
   * AMBIGUOUS: CLAUDE.md §7 sketches a single `POST /events` covering both
   * "create request/draft". A separate route is used instead because the two
   * carry different validation contracts, and Nest resolves the DTO from the
   * route — one endpoint would mean hand-rolled conditional validation, and
   * would change the US-03 contract that POST /events returns a SUBMITTED
   * request. §7 is labelled illustrative, so this is a deliberate deviation.
   */
  @Post('drafts')
  @Roles(Role.EVENT_ORGANISER)
  @HttpCode(HttpStatus.CREATED)
  saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DraftEventRequestDto,
  ) {
    return this.eventsService.saveDraft(user, dto);
  }

  /** US-04 AC-2 — continue editing an existing draft. */
  @Patch(':id')
  @Roles(Role.EVENT_ORGANISER)
  updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DraftEventRequestDto,
  ) {
    return this.eventsService.updateDraft(user, id, dto);
  }

  /**
   * US-07 AC-3 — approve a request the Coordinator is assigned to.
   *
   * POST rather than PATCH: this is a review decision, not a field edit. It is
   * naturally idempotent anyway — setStatus() treats APPROVED -> APPROVED as a
   * no-op rather than an error.
   */
  @Post(':id/approve')
  @Roles(Role.EVENT_COORDINATOR)
  @HttpCode(HttpStatus.OK)
  approve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.eventsService.approve(user, id);
  }

  /**
   * US-09 — the Coordinator asks the Organiser a question.
   *
   * Separate route from the response below so each carries its own role gate;
   * one endpoint serving both parties would need two roles and a branch, which
   * would put an authorisation decision inside the service.
   */
  @Post(':id/clarifications')
  @Roles(Role.EVENT_COORDINATOR)
  @HttpCode(HttpStatus.CREATED)
  askClarification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AskClarificationDto,
  ) {
    return this.eventsService.askClarification(user, id, dto);
  }

  /** US-09 AC-4 — the Organiser answers; the Coordinator is notified. */
  @Post(':id/clarifications/responses')
  @Roles(Role.EVENT_ORGANISER)
  @HttpCode(HttpStatus.CREATED)
  respondToClarification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RespondClarificationDto,
  ) {
    return this.eventsService.respondToClarification(user, id, dto);
  }

  /**
   * US-47 — reject an approved request that cannot be fulfilled (no suitable
   * venue, no available equipment, or both), releasing what it holds.
   * Separate from US-08's review rejection below.
   */
  @Post(':id/reject-unfulfillable')
  @Roles(Role.EVENT_COORDINATOR)
  @HttpCode(HttpStatus.OK)
  rejectUnfulfillable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectUnfulfillableDto,
  ) {
    return this.unfulfillable.reject(user, id, dto);
  }

  /**
   * US-08 — reject the request outright. Separate route from return: they are
   * distinct decisions with distinct outcomes, not one endpoint with a flag.
   */
  @Post(':id/reject')
  @Roles(Role.EVENT_COORDINATOR)
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectRequestDto,
  ) {
    return this.eventsService.reject(user, id, dto);
  }

  /** US-08 — return the request to the Organiser to amend and resubmit. */
  @Post(':id/return')
  @Roles(Role.EVENT_COORDINATOR)
  @HttpCode(HttpStatus.OK)
  returnForAmendment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReturnRequestDto,
  ) {
    return this.eventsService.returnForAmendment(user, id, dto);
  }

  /**
   * US-25 prerequisite — APPROVED -> PLANNING, through setStatus(). Without
   * it no event could reach the status the story edits.
   */
  @Post(':id/start-planning')
  @Roles(Role.EVENT_COORDINATOR)
  @HttpCode(HttpStatus.OK)
  startPlanning(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.eventsService.startPlanning(user, id);
  }

  /**
   * US-25 — update an event's information during planning.
   *
   * A separate route from PATCH /events/:id: that one is the Organiser's
   * draft edit, with a different role, a different set of editable statuses,
   * and no review flag. Sharing it would mean branching on role in the
   * service.
   */
  @Patch(':id/planning')
  @Roles(Role.EVENT_COORDINATOR)
  updateDuringPlanning(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePlanningDto,
  ) {
    return this.eventsService.updateDuringPlanning(user, id, dto);
  }

  /**
   * US-28 — record the equipment and technical support an event in planning
   * needs. Its own route rather than part of PATCH :id/planning: the
   * equipment is a list of rows, not a field on the event.
   */
  @Patch(':id/technical-requirements')
  @Roles(Role.EVENT_COORDINATOR)
  setTechnicalRequirements(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TechnicalRequirementsDto,
  ) {
    return this.eventsService.setTechnicalRequirements(user, id, dto);
  }

  /**
   * US-61 AC-1/AC-2/AC-4 — the event's Technical Support assignee and every
   * member with whether they are free for the event's date and time.
   */
  @Get(':id/technical-support')
  @Roles(Role.EVENT_COORDINATOR)
  getTechnicalSupport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.technicalSupport.getAssignment(user, id);
  }

  /**
   * US-61 AC-1 — assign (or change) the event's Technical Support member.
   * 409 naming the overlapping event (AC-2), or with the "no one available"
   * message (AC-4).
   */
  @Put(':id/technical-support')
  @Roles(Role.EVENT_COORDINATOR)
  assignTechnicalSupport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignTechnicalSupportDto,
  ) {
    return this.technicalSupport.assign(user, id, dto);
  }

  /** US-61 — remove the event's Technical Support assignment. */
  @Delete(':id/technical-support')
  @Roles(Role.EVENT_COORDINATOR)
  unassignTechnicalSupport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.technicalSupport.unassign(user, id);
  }

  /** US-42 AC-1/AC-2 — what is ready to confirm and what is outstanding. */
  @Get(':id/confirmation-readiness')
  @Roles(Role.EVENT_COORDINATOR)
  getConfirmationReadiness(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.confirmation.readinessFor(user, id);
  }

  /** US-42 AC-3/AC-4 — confirm the arrangements; on to the safety check. */
  @Post(':id/confirm')
  @Roles(Role.EVENT_COORDINATOR)
  @HttpCode(HttpStatus.OK)
  confirmArrangements(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.confirmation.confirm(user, id);
  }

  /** US-42 — tick a free-text equipment line as checked by hand. */
  @Post(':id/requirements/:reqId/manual-confirm')
  @Roles(Role.EVENT_COORDINATOR)
  @HttpCode(HttpStatus.OK)
  manualConfirmRequirement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('reqId') reqId: string,
  ) {
    return this.confirmation.manualConfirm(user, id, reqId);
  }

  /** US-42 — undo the tick. */
  @Delete(':id/requirements/:reqId/manual-confirm')
  @Roles(Role.EVENT_COORDINATOR)
  undoManualConfirmRequirement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('reqId') reqId: string,
  ) {
    return this.confirmation.undoManualConfirm(user, id, reqId);
  }

  /** US-26 — the event's change history, oldest first. */
  @Get(':id/history')
  @Roles(Role.EVENT_COORDINATOR)
  getChangeHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.eventsService.getChangeHistory(user, id);
  }

  /**
   * US-37 — the Organiser proposes a change to one of their submitted events.
   * Saved as PENDING beside the event; the event itself is not edited.
   */
  @Post(':id/change-requests')
  @Roles(Role.EVENT_ORGANISER)
  @HttpCode(HttpStatus.CREATED)
  requestChange(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateChangeRequestDto,
  ) {
    return this.changeRequests.request(user, id, dto);
  }

  /**
   * US-43 — the Organiser cancels their own event. POST with a body rather than
   * DELETE: the event is kept (as CANCELLED), and the reason and confirmation
   * travel with the request.
   */
  @Post(':id/cancel')
  @Roles(Role.EVENT_ORGANISER)
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelEventDto,
  ) {
    return this.cancellation.cancel(user, id, dto);
  }

  /** US-04 AC-4 — DRAFT -> SUBMITTED, through setStatus(). */
  @Post(':id/submit')
  @Roles(Role.EVENT_ORGANISER)
  @HttpCode(HttpStatus.OK)
  submitDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.eventsService.submitDraft(user, id);
  }

  @Get()
  @RequirePermission(Resource.EVENT, Action.READ)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.findAllForUser(user);
  }

  /**
   * US-05 — the Organiser's own requests and their statuses.
   *
   * MUST be declared before @Get(':id'), or Nest matches "mine" as an id.
   *
   * A dedicated route rather than reusing GET /events: this story specifies
   * @Roles(EVENT_ORGANISER), and putting that on the shared list would lock
   * out Coordinators and Attendees, breaking US-02 AC-2 and US-06 AC-6. See
   * the US-05 summary.
   */
  @Get('mine')
  @Roles(Role.EVENT_ORGANISER)
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.findMyRequests(user);
  }

  /**
   * US-38 AC-1 — pending change requests on the Coordinator's own events.
   * Declared before the :id routes; "change-requests" is a literal segment.
   */
  @Get('change-requests/pending')
  @Roles(Role.EVENT_COORDINATOR)
  listPendingChangeRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.changeReviews.listPending(user);
  }

  /** US-38 AC-2 / AC-6 — one request: current vs proposed, reason, warnings. */
  @Get('change-requests/:requestId')
  @Roles(Role.EVENT_COORDINATOR)
  getChangeRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    return this.changeReviews.getForReview(user, requestId);
  }

  /** US-38 AC-4 — approve: the event takes the proposed values. */
  @Post('change-requests/:requestId/approve')
  @Roles(Role.EVENT_COORDINATOR)
  @HttpCode(HttpStatus.OK)
  approveChangeRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    return this.changeReviews.approve(user, requestId);
  }

  /** US-38 AC-3 / AC-5 — reject, with a reason; the event is unchanged. */
  @Post('change-requests/:requestId/reject')
  @Roles(Role.EVENT_COORDINATOR)
  @HttpCode(HttpStatus.OK)
  rejectChangeRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: RejectChangeRequestDto,
  ) {
    return this.changeReviews.reject(user, requestId, dto);
  }

  /**
   * US-37 — the equipment catalogue, as the change request form's picker.
   * #27: also the Coordinator's picker for an event's required equipment.
   *
   * MUST be declared before @Get(':id'). A dedicated route because
   * GET /equipment is Technical Support only; this returns just id, type,
   * description and location.
   */
  @Get('equipment-catalogue')
  @Roles(Role.EVENT_ORGANISER, Role.EVENT_COORDINATOR)
  listEquipmentCatalogue() {
    return this.changeRequests.listCatalogue();
  }

  /**
   * US-12 — the Coordinator's queue, in full detail.
   *
   * MUST be declared before @Get(':id'). A dedicated route rather than the
   * shared GET /events, for the same reason as /events/mine: this story
   * specifies @Roles(EVENT_COORDINATOR), and putting that on the shared list
   * would lock out Organisers and Attendees.
   */
  @Get('assigned')
  @Roles(Role.EVENT_COORDINATOR)
  findAssigned(@CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.findAssignedRequests(user);
  }

  /** US-12 AC-1/AC-2 — all details of one request in the Coordinator's queue. */
  @Get('assigned/:id')
  @Roles(Role.EVENT_COORDINATOR)
  findAssignedById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.eventsService.findAssignedRequest(user, id);
  }

  /** US-05 — one of the Organiser's own requests, with its status detail. */
  @Get('mine/:id')
  @Roles(Role.EVENT_ORGANISER)
  findMineById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.eventsService.findMyRequest(user, id);
  }

  /** AC-4 — every detail entered, plus current status. */
  @Get(':id')
  @RequirePermission(Resource.EVENT, Action.READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.eventsService.findOneForUser(user, id);
  }

  /**
   * US-02 AC-1: declares no permission, so RolesGuard must deny every role by
   * default. Kept as executable proof that an undeclared route fails closed.
   */
  @Get(':id/internal-notes')
  undeclaredRoute() {
    return { shouldNeverBeReturned: true };
  }
}
