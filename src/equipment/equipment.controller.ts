import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
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
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CommitReservationDto } from './dto/commit-reservation.dto';
import { EquipmentRequirementsService } from './equipment-requirements.service';
import { EquipmentReservationsService } from './equipment-reservations.service';
import { EquipmentService } from './equipment.service';

/**
 * US-29 to US-33 — Technical Support's equipment features.
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

  /** US-31 AC-4 — submitted events that have equipment requirements. */
  @Get('requirements')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  @Header('Cache-Control', 'no-store')
  findRequirements(@CurrentUser() user: AuthenticatedUser) {
    return this.requirementsService.findEventsWithRequirements(user);
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
}
