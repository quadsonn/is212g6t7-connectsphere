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

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ResubmitSafetyDto } from './dto/resubmit-safety.dto';
import { SafetyDecisionDto } from './dto/safety-decision.dto';
import { SafetyService } from './safety.service';

/**
 * Requirement change 6 — the Safety Officer's queue, review and decision.
 *
 * @Roles is the coarse gate; the service re-checks the SAFETY_REVIEW grant, so
 * a decision is the Safety Officer's alone (the matrix gives DECIDE to no
 * other role).
 */
@Controller('safety')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  /** AC-1: events awaiting a safety check, longest-waiting first. */
  @Get('queue')
  @Roles(Role.SAFETY_OFFICER)
  listQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.safety.listQueue(user);
  }

  /** AC-2: what the Safety Officer reviews for one queued event. */
  @Get('events/:id')
  @Roles(Role.SAFETY_OFFICER)
  getPacket(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.safety.getPacket(user, id);
  }

  /** AC-4..AC-7: approve, reject or request changes. */
  @Post('events/:id/decision')
  @Roles(Role.SAFETY_OFFICER)
  @HttpCode(HttpStatus.OK)
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SafetyDecisionDto,
  ) {
    return this.safety.decide(user, id, dto);
  }

  /**
   * The Coordinator answers the Safety Officer's feedback: changes made, send
   * the event back for a new check.
   */
  @Post('events/:id/resubmit')
  @Roles(Role.EVENT_COORDINATOR)
  @HttpCode(HttpStatus.OK)
  resubmit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResubmitSafetyDto,
  ) {
    return this.safety.resubmit(user, id, dto);
  }

  /**
   * AC-9: every earlier check stays visible. The Safety Officer sees any
   * event's; a Coordinator sees the events they coordinate, which is how the
   * reasons reach them.
   */
  @Get('events/:id/reviews')
  @Roles(Role.SAFETY_OFFICER, Role.EVENT_COORDINATOR)
  getHistory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.safety.getHistory(user, id);
  }
}
