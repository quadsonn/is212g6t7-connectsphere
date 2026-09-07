import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

import { IsAfterField } from '../../common/validators/is-after.validator';

/**
 * US-04 — the payload for saving or editing a draft (AC-1, AC-2).
 *
 * Every field is optional: a draft is work in progress, and AC-1 requires it
 * to save with required fields still empty. This is deliberately NOT a
 * PartialType(CreateEventRequestDto) — that would inherit "must be in the
 * future" and the required-field messages, which is exactly the submission
 * validation a draft must not trigger.
 *
 * What IS still enforced: shape and sanity. A draft may be incomplete, but it
 * may not hold a string where a number belongs, or an end time before its
 * start — storing incoherent data helps nobody, and the Organiser is better
 * told immediately than at submission.
 *
 * AMBIGUOUS: AC-1 says "without triggering full submission validation" without
 * saying where the line falls. Drawn here at completeness (not enforced) vs.
 * type correctness (enforced).
 */
export class DraftEventRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  purpose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  /**
   * No @MinDate here — a draft may legitimately hold a date that has since
   * passed. Submission is where that is caught (US-03 AC-3).
   */
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'proposedStart must be a valid ISO 8601 date' })
  proposedStart?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'proposedEnd must be a valid ISO 8601 date' })
  @IsAfterField('proposedStart', {
    message: 'proposedEnd must be later than proposedStart',
  })
  proposedEnd?: Date;

  @IsOptional()
  @IsInt({ message: 'expectedAttendance must be a whole number' })
  @IsPositive({ message: 'expectedAttendance must be greater than zero' })
  @Type(() => Number)
  expectedAttendance?: number;

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
