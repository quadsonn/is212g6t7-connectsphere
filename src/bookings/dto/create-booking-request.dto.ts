import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  MinDate,
} from 'class-validator';

import { IsAfterField } from '../../common/validators/is-after.validator';

/**
 * US-21 — a Coordinator's request to book a venue for one of their events.
 *
 * AC-1 asks for "event date, start/end time, and expected attendance". The
 * API takes the date and times combined as two ISO timestamps, which is what
 * conflict detection compares; the form splits them back into a date and two
 * times for the person filling it in.
 *
 * AC-2's requirements are deliberately NOT accepted here: they are copied from
 * the event the Coordinator already recorded them on, so the request cannot
 * disagree with the event it is for.
 */
export class CreateBookingRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'eventId is required' })
  eventId: string;

  @IsString()
  @IsNotEmpty({ message: 'venueId is required' })
  venueId: string;

  /**
   * AMBIGUOUS: as with US-03, "in the future" has no minimum lead time. If
   * Venue Staff need notice (e.g. 48 hours), that threshold belongs here.
   */
  @Type(() => Date)
  @IsDate({ message: 'start must be a valid ISO 8601 date' })
  @MinDate(() => new Date(), { message: 'start must be in the future' })
  start: Date;

  @Type(() => Date)
  @IsDate({ message: 'end must be a valid ISO 8601 date' })
  @IsAfterField('start', { message: 'end must be later than start' })
  end: Date;

  @IsInt({ message: 'expectedAttendance must be a whole number' })
  @IsPositive({ message: 'expectedAttendance must be greater than zero' })
  @Type(() => Number)
  expectedAttendance: number;
}
