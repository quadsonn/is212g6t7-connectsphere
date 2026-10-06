import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Action, Resource } from '../common/access/permission.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { CalendarService } from './calendar.service';
import { CalendarQueryDto, CreateVenueBlockDto } from './dto/calendar.dto';

/** US-16 — the Venue Staff availability calendar. */
@Controller('calendar')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  /** AC-1..AC-5. no-store: AC-5 needs every refresh to be current. */
  @Get()
  @RequirePermission(Resource.BOOKING, Action.DECIDE)
  @Header('Cache-Control', 'no-store')
  getCalendar(@CurrentUser() user: AuthenticatedUser, @Query() query: CalendarQueryDto) {
    return this.calendarService.getCalendar(user, query);
  }

  /** AC-6 — block out a period. Managing a venue's availability is a venue update. */
  @Post('blocks')
  @RequirePermission(Resource.VENUE, Action.UPDATE)
  @HttpCode(HttpStatus.CREATED)
  createBlock(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVenueBlockDto) {
    return this.calendarService.createBlock(user, dto);
  }

  @Delete('blocks/:id')
  @RequirePermission(Resource.VENUE, Action.UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeBlock(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.calendarService.removeBlock(user, id);
  }
}
