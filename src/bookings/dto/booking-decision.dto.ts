import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { Trim } from '../../common/validators/trim.transform';

/**
 * US-41 AC-1 — the alternative venues attached to a rejection, by id. Each is
 * checked server-side (AC-4: it must be free for the requested time).
 *
 * AMBIGUOUS: "one or more" sets no upper limit; ten keeps a rejection
 * readable and the per-venue checks bounded.
 */
export const MAX_SUGGESTIONS = 10;

class AlternativeVenuesField {
  @IsOptional()
  @IsArray({ message: 'alternativeVenueIds must be a list of venue ids' })
  @ArrayUnique({ message: 'each alternative venue may be suggested only once' })
  @ArrayMaxSize(MAX_SUGGESTIONS, {
    message: `at most ${MAX_SUGGESTIONS} alternative venues can be suggested`,
  })
  @IsString({ each: true, message: 'each alternative venue must be a venue id' })
  @IsNotEmpty({ each: true, message: 'each alternative venue must be a venue id' })
  alternativeVenueIds?: string[];
}

/** US-23 AC-3 — approval allows, but does not require, a comment. */
export class ApproveBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/**
 * US-23 AC-2 — a rejection cannot be submitted without a reason.
 * US-41 AC-1 — and may carry alternative venues.
 *
 * #22 AC-2: trimmed first, so a reason of only spaces is refused, not saved
 * as an empty reason.
 */
export class RejectBookingDto extends AlternativeVenuesField {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'a reason is required to reject this booking request' })
  @MaxLength(2000)
  reason: string;
}

/**
 * US-23 AC-6 — overturning a decision is its own recorded action, and needs a
 * reason for the same accountability reason a rejection does.
 *
 * US-41: a reversal *to* rejected is a rejection, so it may carry
 * alternatives too; a reversal to approved may not (BookingsService.reverse).
 *
 * #22 AC-2: trimmed first, like the rejection reason.
 */
export class ReverseBookingDto extends AlternativeVenuesField {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'a reason is required to reverse this decision' })
  @MaxLength(2000)
  reason: string;
}

/** US-51 — clearing a "Conflict - needs review" flag; a note is optional. */
export class ResolveReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
