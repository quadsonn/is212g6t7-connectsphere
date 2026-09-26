import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { Action, Resource } from '../common/access/permission.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { BrowseVenuesDto } from './dto/browse-venues.dto';
import { VenueDraftDto } from './dto/venue-draft.dto';
import { VenuesService } from './venues.service';
import { FileInterceptor } from '@nestjs/platform-express';

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
  // US-15 AC-4: the catalogue changes whenever staff edit it, so a cached copy
  // is a wrong copy. This stops a browser or proxy serving a stale list; the
  // server itself holds no cache.
  @Header('Cache-Control', 'no-store')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BrowseVenuesDto,
  ) {
    return this.venuesService.findAllForUser(user, query);
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

  @Delete(':id')
  @Roles(Role.VENUE_STAFF)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.venuesService.remove(user, id);
  }

  @Post(':id/images')
  @Roles(Role.VENUE_STAFF)
  @UseInterceptors(FileInterceptor('file'))
  addImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.venuesService.addImage(user, id, file);
  }

  @Delete(':id/images')
  @Roles(Role.VENUE_STAFF)
  removeImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('imageUrl') imageUrl: string,
  ) {
    return this.venuesService.removeImage(user, id, imageUrl);
  }

  /** Declared after the literal routes above so "drafts" is not read as an id. */
  @Get(':id')
  @RequirePermission(Resource.VENUE, Action.READ)
  @Header('Cache-Control', 'no-store')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.venuesService.findOneForUser(user, id);
  }
}
