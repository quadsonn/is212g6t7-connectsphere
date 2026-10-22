import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';

import { AuthenticatedUser } from '../auth/jwt.strategy';
import { Action, Resource } from '../common/access/permission.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { HoldExpiryDto, PlaceHoldDto } from './dto/hold.dto';
import { HoldsService } from './holds.service';

/**
 * US-54 — tentative venue holds. Venue Staff only (BOOKING / DECIDE, the same
 * grant as approving a request); the venue's manager only, else not found
 * (HoldsService).
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class HoldsController {
  constructor(private readonly holds: HoldsService) {}

  /** The events a hold may be placed for, for the picker. */
  @Get('venues/:venueId/holdable-events')
  @RequirePermission(Resource.BOOKING, Action.DECIDE)
  holdableEvents(@CurrentUser() user: AuthenticatedUser, @Param('venueId') venueId: string) {
    return this.holds.holdableEvents(user, venueId);
  }

  /** AC-1 — place a hold. */
  @Post('venues/:venueId/holds')
  @RequirePermission(Resource.BOOKING, Action.DECIDE)
  @HttpCode(HttpStatus.CREATED)
  place(@CurrentUser() user: AuthenticatedUser, @Param('venueId') venueId: string, @Body() dto: PlaceHoldDto) {
    return this.holds.place(user, venueId, dto);
  }

  /** AC-5 — make it a confirmed booking. */
  @Post('bookings/:id/hold/convert')
  @RequirePermission(Resource.BOOKING, Action.DECIDE)
  @HttpCode(HttpStatus.OK)
  convert(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.holds.convert(user, id);
  }

  /** AC-5 — move its expiry. */
  @Post('bookings/:id/hold/extend')
  @RequirePermission(Resource.BOOKING, Action.DECIDE)
  @HttpCode(HttpStatus.OK)
  extend(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: HoldExpiryDto) {
    return this.holds.extend(user, id, dto);
  }

  /** AC-5 — release it now. */
  @Post('bookings/:id/hold/release')
  @RequirePermission(Resource.BOOKING, Action.DECIDE)
  @HttpCode(HttpStatus.OK)
  release(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.holds.release(user, id);
  }
}
