import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AssignCoordinatorDto } from './dto/assign-coordinator.dto';
import { EventsAssignmentService } from './events-assignment.service';

/**
 * Event Coordinator Lead — the unassigned queue, assignment, and supervising
 * and reassigning events. Lead only: @Roles here, and the service re-checks
 * EVENT/ASSIGN, which the permission matrix grants to the Lead alone.
 */
@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.EVENT_COORDINATOR_LEAD)
export class EventsAssignmentController {
  constructor(private readonly assignments: EventsAssignmentService) {}

  /** The unassigned queue, oldest submission first. */
  @Get('queue')
  listQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.assignments.listQueue(user);
  }

  /** One queued request, opened for review before assigning. */
  @Get('queue/:id')
  getQueuedRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.assignments.getQueuedRequest(user, id);
  }

  /** The Coordinators a request can be assigned or reassigned to. */
  @Get('coordinators')
  listCoordinators(@CurrentUser() user: AuthenticatedUser) {
    return this.assignments.listCoordinators(user);
  }

  /** Assign a queued request to a Coordinator. */
  @Post('queue/:id/assign')
  @HttpCode(HttpStatus.OK)
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignCoordinatorDto,
  ) {
    return this.assignments.assign(user, id, dto);
  }

  /** Every Coordinator with their active events; ?coordinatorId= filters. */
  @Get()
  listAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('coordinatorId') coordinatorId?: string,
  ) {
    return this.assignments.listAssignments(user, coordinatorId || undefined);
  }

  /** Move an active event to a different Coordinator. */
  @Post('events/:id/reassign')
  @HttpCode(HttpStatus.OK)
  reassign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignCoordinatorDto,
  ) {
    return this.assignments.reassign(user, id, dto);
  }
}
