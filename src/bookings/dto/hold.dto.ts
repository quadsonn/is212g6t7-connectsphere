import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsString, MinDate } from 'class-validator';

import { IsAfterField } from '../../common/validators/is-after.validator';

/**
 * US-54 AC-2 — expiry must be in the future. "Before the event starts" needs
 * the event, so HoldsService checks that (and that it is before the held slot
 * starts) with the same 400.
 */
export class HoldExpiryDto {
  @Type(() => Date)
  @IsDate({ message: 'expiresAt must be a valid ISO 8601 date' })
  @MinDate(() => new Date(), { message: 'expiresAt must be in the future' })
  expiresAt: Date;
}

/** US-54 AC-1 — POST /venues/:venueId/holds. */
export class PlaceHoldDto extends HoldExpiryDto {
  @IsString()
  @IsNotEmpty({ message: 'eventId is required' })
  eventId: string;

  @Type(() => Date)
  @IsDate({ message: 'start must be a valid ISO 8601 date' })
  @MinDate(() => new Date(), { message: 'start must be in the future' })
  start: Date;

  @Type(() => Date)
  @IsDate({ message: 'end must be a valid ISO 8601 date' })
  @IsAfterField('start', { message: 'end must be later than start' })
  end: Date;
}
