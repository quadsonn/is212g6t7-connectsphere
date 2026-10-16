import { Transform, Type } from 'class-transformer';
import { BookingStatus } from '@prisma/client';
import { IsBoolean, IsDate, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export enum QueueView {
  /** AC-1: requests still waiting on a decision. */
  PENDING = 'pending',
  /** AC-7: requests that have been approved or rejected. */
  DECIDED = 'decided',
}

export enum QueueSortField {
  /** AC-3 "requested event date". */
  EVENT_DATE = 'eventDate',
  /** AC-3 "date the request was submitted". */
  SUBMITTED = 'submitted',
}

/** US-22 — what a Venue Staff member may ask of their queue. */
export class BookingQueueQueryDto {
  @IsOptional()
  @IsEnum(QueueView, { message: 'view must be one of: pending, decided' })
  view?: QueueView;

  /** AC-4: a single venue. One the caller does not manage returns nothing. */
  @IsOptional()
  @IsString()
  venueId?: string;

  /**
   * AC-4: narrows within the chosen view — in practice APPROVED, REJECTED
   * or (US-44) RELEASED on the decided view. A status outside the view returns nothing rather
   * than an error, so a client can keep the filter while switching views.
   */
  @IsOptional()
  @IsEnum(BookingStatus, {
    message: `status must be one of: ${Object.values(BookingStatus).join(', ')}`,
  })
  status?: BookingStatus;

  /** AC-4 date range: bookings overlapping [from, to]. */
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'from must be a valid ISO 8601 date' })
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'to must be a valid ISO 8601 date' })
  to?: Date;

  /** US-51: only bookings flagged "Conflict - needs review" ("true"). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  needsReview?: boolean;

  @IsOptional()
  @IsEnum(QueueSortField, { message: 'sortBy must be one of: eventDate, submitted' })
  sortBy?: QueueSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'sortOrder must be one of: asc, desc' })
  sortOrder?: 'asc' | 'desc';
}
