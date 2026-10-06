import {
  Body,
  Controller,
  Get,
  Header,
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
import { RegisterDto } from './dto/register.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { RegistrationsService } from './registrations.service';

/**
 * US-34 to US-36 — Attendee registration. Every route is Attendee-only; the
 * service additionally checks the matrix grant and that the registration is
 * the caller's own.
 *
 * Static paths are declared before `:id` so Nest does not read "me" or
 * "events" as a registration id.
 */
@Controller('registrations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegistrationsController {
  constructor(private readonly registrations: RegistrationsService) {}

  /** US-35 — "My Registrations". */
  @Get('me')
  @Roles(Role.ATTENDEE)
  @Header('Cache-Control', 'no-store')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.registrations.findMine(user);
  }

  /** US-34 AC-1/AC-6/AC-7 — may I register for this event, and if not, why. */
  @Get('events/:eventId/options')
  @Roles(Role.ATTENDEE)
  @Header('Cache-Control', 'no-store')
  getOptions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
  ) {
    return this.registrations.getOptions(user, eventId);
  }

  /** US-34 — register. 201 with the registration; 409 with the reason if refused. */
  @Post()
  @Roles(Role.ATTENDEE)
  @HttpCode(HttpStatus.CREATED)
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDto) {
    return this.registrations.register(user, dto);
  }

  /** US-35 AC-4 — one registration; 403 if it is another attendee's. */
  @Get(':id')
  @Roles(Role.ATTENDEE)
  @Header('Cache-Control', 'no-store')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.registrations.findOne(user, id);
  }

  /** US-36 — withdraw (body must confirm). 200 with the updated registration. */
  @Post(':id/withdraw')
  @Roles(Role.ATTENDEE)
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() _confirmation: WithdrawDto,
  ) {
    return this.registrations.withdraw(user, id);
  }
}
