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
import { VenueAvailabilityQueryDto } from './dto/venue-availability.dto';
import { VenueSearchDto } from './dto/venue-search.dto';
import { VenueSuitabilityQueryDto } from './dto/venue-suitability.dto';
import { UpdateVenueBuffersDto, VenueBuffersDto } from './dto/venue-buffers.dto';
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

  /**
   * US-18 — search published venues by date, capacity, accessibility and
   * facilities. Declared before ':id' so "search" is not read as an id.
   */
  @Get('search')
  @RequirePermission(Resource.VENUE, Action.CHECK_AVAILABILITY)
  @Header('Cache-Control', 'no-store')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: VenueSearchDto,
  ) {
    return this.venuesService.search(user, query);
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

  /**
   * US-49 — set the venue's setup and turnaround time. US-51: 409 with the
   * clashes unless `confirmConflicts` is true.
   */
  @Patch(':id/buffers')
  @Roles(Role.VENUE_STAFF)
  updateBuffers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVenueBuffersDto,
  ) {
    return this.venuesService.updateBuffers(user, id, dto);
  }

  /** US-51 AC-3 — which bookings these buffers would flag. Saves nothing. */
  @Post(':id/buffers/preview')
  @Roles(Role.VENUE_STAFF)
  @HttpCode(HttpStatus.OK)
  previewBuffers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VenueBuffersDto,
  ) {
    return this.venuesService.previewBuffers(user, id, dto);
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

  /**
   * US-17 — free / tentative / booked per day, for a Coordinator deciding
   * whether to request this venue. Never says which event holds a day.
   */
  @Get(':id/availability')
  @RequirePermission(Resource.VENUE, Action.CHECK_AVAILABILITY)
  // A stale calendar would show a taken day as free.
  @Header('Cache-Control', 'no-store')
  getAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: VenueAvailabilityQueryDto,
  ) {
    return this.venuesService.getAvailability(user, id, query);
  }

  /**
   * US-50 AC-3 — the bookings occupying this venue over the same range, each
   * as separate setup, event and turnaround segments. Anonymous, like US-17.
   */
  @Get(':id/availability/slots')
  @RequirePermission(Resource.VENUE, Action.CHECK_AVAILABILITY)
  @Header('Cache-Control', 'no-store')
  getOccupancy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: VenueAvailabilityQueryDto,
  ) {
    return this.venuesService.getOccupancy(user, id, query);
  }

  /**
   * US-20 — per-requirement suitability flags for one venue against one of
   * the Coordinator's events. Advisory only: never a precondition for
   * requesting the venue (AC-5).
   */
  @Get(':id/suitability')
  @RequirePermission(Resource.VENUE, Action.CHECK_AVAILABILITY)
  @Header('Cache-Control', 'no-store')
  getSuitability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: VenueSuitabilityQueryDto,
  ) {
    return this.venuesService.getSuitability(user, id, query.eventId);
  }

  /** Declared after the literal routes above so "drafts" is not read as an id. */
  @Get(':id')
  @RequirePermission(Resource.VENUE, Action.READ)
  @Header('Cache-Control', 'no-store')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.venuesService.findOneForUser(user, id);
  }
}
