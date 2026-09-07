import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Action, Resource } from '../common/access/permission.types';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { EventsService } from './events.service';

/**
 * Guard order matters: JwtAuthGuard establishes the principal (AC-8),
 * RolesGuard then applies the matrix (AC-1/AC-2/AC-3). Record-level ownership
 * is enforced in the service via AccessControlService.
 */
@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @RequirePermission(Resource.EVENT, Action.READ)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.findAllForUser(user);
  }

  @Get(':id')
  @RequirePermission(Resource.EVENT, Action.READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.eventsService.findOneForUser(user, id);
  }

  /**
   * AC-1: deliberately declares no permission. The matrix has no entry for it,
   * so RolesGuard must deny every role by default. Kept as executable proof
   * that an undeclared route fails closed.
   */
  @Get(':id/internal-notes')
  undeclaredRoute() {
    return { shouldNeverBeReturned: true };
  }
}
