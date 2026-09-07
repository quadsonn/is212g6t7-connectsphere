import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
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

  @IsOptional()
  @IsString()
  @MaxLength(200)
  preferredLayout?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  layoutNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  accessibilityNeeds?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  equipmentNeeds?: string;

  @IsOptional()
  @IsBoolean()
  registrationEnabled?: boolean;
}
