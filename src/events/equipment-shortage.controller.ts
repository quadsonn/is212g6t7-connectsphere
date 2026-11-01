import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
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
import {
  AlternativesQueryDto,
  NoAlternativeDto,
  ReduceReservationDto,
  ReleaseReservationDto,
  SuggestAlternativeDto,
} from './dto/equipment-shortage.dto';
import { EquipmentShortageActionsService } from './equipment-shortage-actions.service';

/**
 * US-45 — resolving an equipment shortage by hand. Lives in the events module
 * because every action is recorded in the event's change history
 * (EventsService.recordChange), as US-61's assignment is.
 */
@Controller('equipment')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EquipmentShortageController {
  constructor(private readonly actions: EquipmentShortageActionsService) {}

  /** An event's upcoming reservations, each with how many it is short by. */
  @Get('events/:eventId/reservations')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  @Header('Cache-Control', 'no-store')
  listForEvent(@CurrentUser() user: AuthenticatedUser, @Param('eventId') eventId: string) {
    return this.actions.listForEvent(user, eventId);
  }

  /** Reduce a reservation to fewer units, with a reason. */
  @Patch('reservations/:id')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  reduce(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReduceReservationDto,
  ) {
    return this.actions.reduce(user, id, dto);
  }

  /** Release a reservation entirely, with a reason. */
  @Post('reservations/:id/release')
  @HttpCode(200)
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  release(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReleaseReservationDto,
  ) {
    return this.actions.release(user, id, dto);
  }

  /** Items free in `quantity` for the reservation's period: what may be suggested. */
  @Get('reservations/:id/alternatives')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  @Header('Cache-Control', 'no-store')
  alternatives(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: AlternativesQueryDto,
  ) {
    return this.actions.alternatives(user, id, query.quantity);
  }

  /** For a confirmed event, suggest an alternative item for a short reservation. */
  @Post('reservations/:id/suggestions')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  suggest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SuggestAlternativeDto,
  ) {
    return this.actions.suggest(user, id, dto);
  }

  /** For a confirmed event, record that no valid alternative exists, with a reason. */
  @Post('reservations/:id/no-alternative')
  @Roles(Role.TECHNICAL_SUPPORT_STAFF)
  noAlternative(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: NoAlternativeDto,
  ) {
    return this.actions.noAlternative(user, id, dto);
  }

  /** The event's Coordinator accepts the suggestion. */
  @Post('suggestions/:id/accept')
  @HttpCode(200)
  @Roles(Role.EVENT_COORDINATOR)
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.actions.accept(user, id);
  }

  /** The event's Coordinator declines it; the reservation stays as it was. */
  @Post('suggestions/:id/decline')
  @HttpCode(200)
  @Roles(Role.EVENT_COORDINATOR)
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.actions.decline(user, id);
  }
}
