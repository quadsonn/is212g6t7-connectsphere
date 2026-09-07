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
import { CreateEventRequestDto } from './dto/create-event-request.dto';
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
