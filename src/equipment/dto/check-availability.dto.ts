import { Type } from 'class-transformer';
import { IsDate, IsInt, IsPositive } from 'class-validator';

import { IsAfterField } from '../../common/validators/is-after.validator';

/**
 * US-30 — the availability question: how many units of this item are free
 * for a given date and time (AC-1), and is the requested quantity among them
 * (AC-4)? The item is the route parameter.
 */
export class CheckAvailabilityDto {
  @Type(() => Date)
  @IsDate({ message: 'start must be a valid ISO 8601 date' })
  start: Date;

  @Type(() => Date)
  @IsDate({ message: 'end must be a valid ISO 8601 date' })
  @IsAfterField('start', { message: 'end must be later than start' })
  end: Date;

  /** AC-4: the requested quantity the free count is compared against. */
  @Type(() => Number)
  @IsInt({ message: 'quantity must be a whole number' })
  @IsPositive({ message: 'quantity must be greater than zero' })
  quantity: number;
}
