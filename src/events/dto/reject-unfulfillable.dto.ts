import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** US-47 AC-2 — why the request cannot be fulfilled. */
export enum UnfulfillableReason {
  NO_SUITABLE_VENUE = 'NO_SUITABLE_VENUE',
  NO_AVAILABLE_EQUIPMENT = 'NO_AVAILABLE_EQUIPMENT',
  NO_VENUE_OR_EQUIPMENT = 'NO_VENUE_OR_EQUIPMENT',
}

/** How each reason reads to the Organiser. */
export const UNFULFILLABLE_REASON_LABELS: Readonly<Record<UnfulfillableReason, string>> = {
  [UnfulfillableReason.NO_SUITABLE_VENUE]: 'No suitable venue',
  [UnfulfillableReason.NO_AVAILABLE_EQUIPMENT]: 'No available equipment',
  [UnfulfillableReason.NO_VENUE_OR_EQUIPMENT]: 'No suitable venue or available equipment',
};

/**
 * US-47 AC-2/AC-3 — reject a request that cannot be fulfilled, with a reason
 * and a comment.
 *
 * AC-3: the reason is required. The comment is required too, because the
 * existing rejection (US-08, RejectRequestDto) cannot be confirmed without
 * written text, and this rejection follows it.
 */
export class RejectUnfulfillableDto {
  @IsEnum(UnfulfillableReason, {
    message: `a reason is required: one of ${Object.values(UnfulfillableReason).join(', ')}`,
  })
  reason: UnfulfillableReason;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'a comment is required to reject this request' })
  @IsNotEmpty({ message: 'a comment is required to reject this request' })
  @MaxLength(2000)
  comment: string;
}
