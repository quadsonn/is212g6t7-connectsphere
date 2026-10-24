import { Type } from 'class-transformer';
import { AccessibilityFeature, Facility, RoomLayout } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
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
 * US-03 — the payload an Organiser submits.
 *
 * Every rule here maps to AC-1 (required fields), AC-3 (each offending field
 * flagged) or AC-5 (attendance is a positive whole number). Validation runs
 * with the global ValidationPipe, which collects *all* failures rather than
 * stopping at the first.
 */
export class CreateEventRequestDto {
  /**
   * AMBIGUOUS: AC-1 lists purpose, category, dates and attendance as the
   * required set, but the schema also makes name and description NOT NULL.
   * Both are required here — a request with no title cannot be reviewed.
   */
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(200)
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'purpose is required' })
  @MaxLength(2000)
  purpose: string;

  @IsString()
  @IsNotEmpty({ message: 'description is required' })
  @MaxLength(5000)
  description: string;

  /** AC-1 "event type/category". Free text — no vocabulary is specified. */
  @IsString()
  @IsNotEmpty({ message: 'category is required' })
  @MaxLength(100)
  category: string;

  /**
   * AC-3 "past date". Rejected if it is not in the future.
   *
   * AMBIGUOUS: "past" is treated as "at or before now". There is no minimum
   * lead time — a request for one minute from now is accepted. If the customer
   * expects notice (e.g. 14 days), that threshold belongs here.
   */
  @Type(() => Date)
  @IsDate({ message: 'proposedStart must be a valid ISO 8601 date' })
  @MinDate(() => new Date(), {
    message: 'proposedStart must be in the future',
  })
  proposedStart: Date;

  @Type(() => Date)
  @IsDate({ message: 'proposedEnd must be a valid ISO 8601 date' })
  @IsAfterField('proposedStart', {
    message: 'proposedEnd must be later than proposedStart',
  })
  proposedEnd: Date;

  /**
   * AC-5: a positive whole number, so later venue-suitability checks can
   * compare it against Venue.capacity without re-parsing.
   */
  @IsInt({ message: 'expectedAttendance must be a whole number' })
  @IsPositive({ message: 'expectedAttendance must be greater than zero' })
  @Type(() => Number)
  expectedAttendance: number;

  /**
   * US-06 AC-1 — a selection from the predefined list. Optional: AC-5 makes
   * layout a preference, not a blocker on submission.
   */
  @IsOptional()
  @IsEnum(RoomLayout, {
    message: `preferredLayout must be one of: ${Object.values(RoomLayout).join(', ')}`,
  })
  preferredLayout?: RoomLayout;

  /** US-06 AC-2 — qualification for a layout that does not fit the list. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  layoutNotes?: string;

  /** US-06 AC-3 — structured requirements. Empty or absent means none. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(AccessibilityFeature, {
    each: true,
    message: `accessibilityRequirements must contain only: ${Object.values(AccessibilityFeature).join(', ')}`,
  })
  accessibilityRequirements?: AccessibilityFeature[];

  /** US-06 AC-3 — free-text qualification alongside the selections. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  accessibilityNotes?: string;

  /**
   * US-20 AC-3 — facilities the event needs, from the list venues use
   * (US-18). Empty or absent means none.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Facility, {
    each: true,
    message: `requiredFacilities must contain only: ${Object.values(Facility).join(', ')}`,
  })
  requiredFacilities?: Facility[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  equipmentNeeds?: string;

  @IsOptional()
  @IsBoolean()
  registrationEnabled?: boolean;
}
