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

import { Action, Resource } from '../common/access/permission.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { VenueDraftDto } from './dto/venue-draft.dto';
import { VenuesService } from './venues.service';

@Controller('venues')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  /**
   * AC-4/AC-6 — the catalogue. Open to every role holding VENUE/READ, not just
   * Venue Staff: Coordinators browse it when planning. What each caller sees
   * is decided in the service.
   */
  @Get()
  @RequirePermission(Resource.VENUE, Action.READ)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.venuesService.findAllForUser(user);
  }

  /** AC-2 — create a draft, however incomplete. */
  @Post('drafts')
  @Roles(Role.VENUE_STAFF)
  @HttpCode(HttpStatus.CREATED)
  saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VenueDraftDto,
  ) {
    return this.venuesService.saveDraft(user, dto);
  }

  /** AC-1 — keep filling a draft in. */
  @Patch(':id')
  @Roles(Role.VENUE_STAFF)
  updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VenueDraftDto,
  ) {
    return this.venuesService.updateDraft(user, id, dto);
  }

  /** AC-3/AC-5 — publish once complete. */
  @Post(':id/publish')
  @Roles(Role.VENUE_STAFF)
  @HttpCode(HttpStatus.OK)
  publish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.venuesService.publish(user, id);
  }

  /** Declared after the literal routes above so "drafts" is not read as an id. */
  @Get(':id')
  @RequirePermission(Resource.VENUE, Action.READ)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.venuesService.findOneForUser(user, id);
  }
}
