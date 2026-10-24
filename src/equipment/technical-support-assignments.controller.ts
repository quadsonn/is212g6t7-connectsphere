import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TechnicalSupportAssignmentsService } from './technical-support-assignments.service';

/**
 * US-61 AC-3 — a Technical Support member's own assignment list.
 *
 * Its own controller and path rather than a route on EquipmentController:
 * this is about the member's events, not the catalogue, and keeps
 * `/equipment/:id` from having to be ordered around it. Technical Support
 * only, as for every equipment feature.
 */
@Controller('technical-support')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TECHNICAL_SUPPORT_STAFF)
export class TechnicalSupportAssignmentsController {
  constructor(private readonly assignments: TechnicalSupportAssignmentsService) {}

  /** The events the caller is assigned to: date, time, venue, requirements. */
  @Get('assignments')
  @Header('Cache-Control', 'no-store')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.assignments.findMine(user);
  }
}
