import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { BrowseEquipmentDto } from './dto/browse-equipment.dto';
import { ChangeEquipmentStatusDto } from './dto/change-equipment-status.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CommitReservationDto } from './dto/commit-reservation.dto';
import { RequirementsListQueryDto } from './dto/requirements-list-query.dto';
import { EquipmentRequirementsService } from './equipment-requirements.service';
import { EquipmentReservationsService } from './equipment-reservations.service';
import { EquipmentService } from './equipment.service';
import { EquipmentSubstitutionsService } from './equipment-substitutions.service';
import { SuggestSubstitutionDto } from './dto/substitution-choice.dto';

/**
 * US-29 to US-33, US-45 — Technical Support's equipment features.
 *
 * Every route is restricted with @Roles(TECHNICAL_SUPPORT_STAFF): these
 * stories are for that role only. @Roles rather than @RequirePermission
 * because the matrix also grants EQUIPMENT/READ to Coordinators (US-02), and
 * a permission gate would let them in. Each service method additionally
 * checks the matrix grant it relies on, and equipment.controller.spec.ts
 * asserts every route carries this role list.
 *
 * Static paths are declared before `:id` so Nest does not read
 * "requirements" or "reservations" as an equipment id.
 */
@Controller('equipment')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EquipmentController {
  constructor(
    private readonly equipmentService: EquipmentService,
    private readonly requirementsService: EquipmentRequirementsService,
    private readonly reservationsService: EquipmentReservationsService,
    private readonly substitutionsService: EquipmentSubstitutionsService,
  ) {}

  /** US-29 AC-1/AC-3 — the catalogue. */
  @Get()
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  // US-29 AC-4: the catalogue changes whenever it is edited, so a cached copy
  // is a wrong copy — same reasoning as the venue catalogue.
  @Header('Cache-Control', 'no-store')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BrowseEquipmentDto,
  ) {
    return this.equipmentService.findAllForUser(user, query);
  }

  /**
   * US-31 AC-4 — submitted events that have equipment requirements.
   * #30 AC-4: finished events only with ?includeFinished=true.
   */
  @Get('requirements')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  @Header('Cache-Control', 'no-store')
  findRequirements(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RequirementsListQueryDto,
  ) {
    return this.requirementsService.findEventsWithRequirements(user, query);
  }

  /** US-31 AC-1/AC-2/AC-3 — one submitted event's requirements. */
  @Get('requirements/:eventId')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  @Header('Cache-Control', 'no-store')
  findRequirementsForEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
  ) {
    return this.requirementsService.findForEvent(user, eventId);
  }

  /**
   * US-31 "View more details" — the full event, under the same rule as
   * GET requirements/:eventId: any submitted event; drafts are 404.
   */
  @Get('requirements/:eventId/details')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  @Header('Cache-Control', 'no-store')
  findEventDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
  ) {
    return this.requirementsService.findDetailsForEvent(user, eventId);
  }

  /**
   * US-32 — commit a quantity of an item to an event. 201 with the
   * reservation on success; 409 with the reason when the quantity is not free.
   */
  @Post('reservations')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  @HttpCode(HttpStatus.CREATED)
  commit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CommitReservationDto,
  ) {
    return this.reservationsService.commit(user, dto);
  }

  /** US-33 AC-3 — reservations released because their event was cancelled. */
  @Get('reservations/released')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  @Header('Cache-Control', 'no-store')
  findReleased(@CurrentUser() user: AuthenticatedUser) {
    return this.reservationsService.findReleased(user);
  }

  /**
   * The items that could replace this reservation's equipment: in service, not
   * the item itself, with the reservation's full quantity free. Fills the
   * "alternative" dropdown.
   */
  @Get('reservations/:reservationId/alternatives')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  @Header('Cache-Control', 'no-store')
  findAlternatives(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reservationId') reservationId: string,
  ) {
    return this.substitutionsService.candidatesFor(user, reservationId);
  }

  /**
   * Answer for a reservation after the status change - the item was already
   * out of service. 201 with the substitution; 409 when the reservation does
   * not need one or already has one.
   */
  @Post('reservations/:reservationId/substitution')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  @HttpCode(HttpStatus.CREATED)
  suggestSubstitution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reservationId') reservationId: string,
    @Body() dto: SuggestSubstitutionDto,
  ) {
    return this.substitutionsService.suggest(user, reservationId, dto);
  }

  /** US-29 AC-2 — one item's full detail, including operational status. */
  @Get(':id')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  @Header('Cache-Control', 'no-store')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.equipmentService.findOneForUser(user, id);
  }

  /**
   * US-30 — free units of this item for a date and time. A GET: it reads and
   * locks nothing; reserving is US-32's POST /equipment/reservations.
   */
  @Get(':id/availability')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  @Header('Cache-Control', 'no-store')
  checkAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: CheckAvailabilityDto,
  ) {
    return this.equipmentService.checkAvailability(user, id, query);
  }

  /**
   * US-45 AC-5 — reservations of this item that have not ended yet: what
   * marking it Damaged or Under Maintenance would affect. Read before the
   * change so the warning is shown while it can still be cancelled.
   */
  @Get(':id/upcoming-reservations')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  @Header('Cache-Control', 'no-store')
  findUpcomingReservations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.equipmentService.findUpcomingReservations(user, id);
  }

  /**
   * US-45 AC-1/AC-2/AC-3 — mark an item Damaged or Under Maintenance, or back
   * to Available, with a reason. 200 with the updated item and the affected
   * reservations (AC-5); 409 when the item already has that status.
   */
  @Patch(':id/status')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeEquipmentStatusDto,
  ) {
    return this.equipmentService.changeStatus(user, id, dto);
  }
}
