import { AccessibilityFeature, RoomLayout } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
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
 * AC-2's requirements are copied from the event the Coordinator already
 * recorded them on. US-53 AC-2: an event needing several spaces (a hall and
 * breakout rooms) needs different requirements per venue, so each may be set
 * on the request instead; anything left out is still copied.
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

  /**
   * US-52 AC-3: set when this request replaces a booking whose venue became
   * unavailable. The request is otherwise an ordinary one — same checks, and
   * Venue Staff still decide on it; approving it releases the original.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'replacesBookingId must be a booking id' })
  replacesBookingId?: string;

  // US-53 AC-2 — this venue's own requirements. Each is optional: omitted
  // means "as the event (or, for a replacement, the replaced booking)
  // records it"; null clears it for this venue.

  @IsOptional()
  @IsEnum(RoomLayout, { message: `preferredLayout must be one of: ${Object.values(RoomLayout).join(', ')}` })
  preferredLayout?: RoomLayout | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  layoutNotes?: string | null;

  @IsOptional()
  @IsArray({ message: 'accessibilityRequirements must be a list' })
  @ArrayUnique()
  @IsEnum(AccessibilityFeature, {
    each: true,
    message: `each accessibility requirement must be one of: ${Object.values(AccessibilityFeature).join(', ')}`,
  })
  accessibilityRequirements?: AccessibilityFeature[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  accessibilityNotes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  equipmentNeeds?: string | null;
}
