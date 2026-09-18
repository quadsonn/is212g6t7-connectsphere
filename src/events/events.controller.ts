import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
import { AssignCoordinatorDto } from './dto/assign-coordinator.dto';
import { AskClarificationDto } from './dto/ask-clarification.dto';
import { CreateEventRequestDto } from './dto/create-event-request.dto';
import { RespondClarificationDto } from './dto/respond-clarification.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { ReturnRequestDto } from './dto/return-request.dto';
import { DraftEventRequestDto } from './dto/draft-event-request.dto';
import { EventsService } from './events.service';

/**
 * Guard order: JwtAuthGuard establishes the principal, RolesGuard applies the
 * declared role or permission. Record-level ownership is enforced in the
 * service via AccessControlService.
 */
@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

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
   * US-10 — assign or reassign the event's main point of contact.
   *
   * @Roles(EVENT_COORDINATOR) per CLAUDE.md §1, which gives the Coordinator
   * role "assigns/coordinates events". The matrix grants EVENT/ASSIGN at ANY
   * scope so a peer's event can be reassigned (AC-2).
   *
   * PATCH rather than POST: this replaces a single field on an existing
   * resource and is idempotent — assigning the same Coordinator twice leaves
   * the same state.
   */
  @Patch(':id/coordinator')
  @Roles(Role.EVENT_COORDINATOR)
  assignCoordinator(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignCoordinatorDto,
  ) {
    return this.eventsService.assignCoordinator(user, id, dto);
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
