import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
