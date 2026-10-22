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

import { Action, Resource } from '../common/access/permission.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { BookingSuggestionsService } from './booking-suggestions.service';
import { BookingReviewService } from './booking-review.service';
import { BookingsService } from './bookings.service';
import { VenueUnavailabilityService } from './venue-unavailability.service';
import {
  ApproveBookingDto,
  RejectBookingDto,
  ResolveReviewDto,
  ReverseBookingDto,
} from './dto/booking-decision.dto';
import { BookingQueueQueryDto } from './dto/booking-queue-query.dto';
import { CreateBookingRequestDto } from './dto/create-booking-request.dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly suggestionsService: BookingSuggestionsService,
    private readonly unavailabilityService: VenueUnavailabilityService,
    private readonly reviews: BookingReviewService,
  ) {}

  /** US-21 — submit a venue booking request. */
  @Post()
  @RequirePermission(Resource.BOOKING, Action.CREATE)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingRequestDto,
  ) {
    return this.bookingsService.createRequest(user, dto);
  }

  /**
   * US-21 AC-6 — the Coordinator's own request history. Gated on CREATE, not
   * READ: "requests I raised" only means something to a role that raises them.
   */
  @Get('mine')
  @RequirePermission(Resource.BOOKING, Action.CREATE)
  @Header('Cache-Control', 'no-store')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.findMyRequests(user);
  }

  /**
   * US-52 AC-2 — this Coordinator's bookings whose venue became unavailable
   * and that still need a replacement. Gated on CREATE, like `mine`: only the
   * role that books venues has anything to replace.
   */
  @Get('replacements-needed')
  @RequirePermission(Resource.BOOKING, Action.CREATE)
  @Header('Cache-Control', 'no-store')
  findNeedingReplacement(@CurrentUser() user: AuthenticatedUser) {
    return this.unavailabilityService.findNeedingReplacement(user);
  }

  /**
   * US-22 — the Venue Staff queue. Gated on DECIDE: the queue exists so the
   * people who decide on requests can work through them.
   */
  @Get('queue')
  @RequirePermission(Resource.BOOKING, Action.DECIDE)
  @Header('Cache-Control', 'no-store')
  findQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BookingQueueQueryDto,
  ) {
    return this.bookingsService.findQueue(user, query);
  }

  /** US-23 AC-5 — every request on one event the caller may read. */
  @Get('events/:eventId')
  @RequirePermission(Resource.BOOKING, Action.READ)
  @Header('Cache-Control', 'no-store')
  findForEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
  ) {
    return this.bookingsService.findForEvent(user, eventId);
  }

  /**
   * US-53 AC-5 — whether the event's venues are arranged (every active
   * booking approved). Coordinator of the event only, like booking for it.
   */
  @Get('events/:eventId/arrangement')
  @RequirePermission(Resource.BOOKING, Action.CREATE)
  @Header('Cache-Control', 'no-store')
  findArrangement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId') eventId: string,
  ) {
    return this.bookingsService.arrangementForEvent(user, eventId);
  }

  /**
   * US-53 AC-6 — cancel or release one booking; the event's others are
   * untouched. Gated on CREATE: the role that books venues releases them.
   */
  @Post(':id/release')
  @RequirePermission(Resource.BOOKING, Action.CREATE)
  @HttpCode(HttpStatus.OK)
  release(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.release(user, id);
  }

  /**
   * US-24 — hard (approved/blocked) and soft (pending) overlaps for one
   * request, for the Venue Staff member who manages its venue. Never cached:
   * the screen re-asks before every approval.
   */
  @Get(':id/conflicts')
  @RequirePermission(Resource.BOOKING, Action.DECIDE)
  @Header('Cache-Control', 'no-store')
  findConflicts(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.findConflicts(user, id);
  }

  /**
   * US-41 AC-2 — venues that could stand in for this request, ranked, for the
   * Venue Staff member deciding it. Never cached: availability moves.
   */
  @Get(':id/alternatives')
  @RequirePermission(Resource.BOOKING, Action.DECIDE)
  @Header('Cache-Control', 'no-store')
  findAlternatives(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.suggestionsService.findAlternatives(user, id);
  }

  /**
   * US-41 AC-6 — accept a suggestion: a new request for that venue, with the
   * rejected request's details. Gated on CREATE: it is a booking request.
   */
  @Post(':id/suggestions/:suggestionId/accept')
  @RequirePermission(Resource.BOOKING, Action.CREATE)
  @HttpCode(HttpStatus.CREATED)
  acceptSuggestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('suggestionId') suggestionId: string,
  ) {
    return this.suggestionsService.accept(user, id, suggestionId);
  }

  /** US-23 AC-3 — approve, optionally with a note. */
  @Post(':id/approve')
  @RequirePermission(Resource.BOOKING, Action.DECIDE)
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveBookingDto,
  ) {
    return this.bookingsService.approve(user, id, dto);
  }

  /** US-23 AC-2 — reject, with a required reason. US-41 AC-1: and alternatives. */
  @Post(':id/reject')
  @RequirePermission(Resource.BOOKING, Action.DECIDE)
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectBookingDto,
  ) {
    return this.bookingsService.reject(user, id, dto);
  }

  /** US-23 AC-6 — reverse a decision as a new recorded action. */
  @Post(':id/reverse')
  @RequirePermission(Resource.BOOKING, Action.DECIDE)
  @HttpCode(HttpStatus.OK)
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReverseBookingDto,
  ) {
    return this.bookingsService.reverse(user, id, dto);
  }

  /**
   * US-51 — clear a "Conflict - needs review" flag by hand. Venue Staff who
   * manage the booking's venue only; recorded as a REVIEW_RESOLVED decision.
   */
  @Post(':id/resolve-review')
  @RequirePermission(Resource.BOOKING, Action.DECIDE)
  @HttpCode(HttpStatus.OK)
  resolveReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveReviewDto,
  ) {
    return this.reviews.resolveReview(user, id, dto.note ?? null);
  }

  /** One request in full. Declared after the literal routes so none is read as an id. */
  @Get(':id')
  @RequirePermission(Resource.BOOKING, Action.READ)
  @Header('Cache-Control', 'no-store')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.findOneForUser(user, id);
  }
}
