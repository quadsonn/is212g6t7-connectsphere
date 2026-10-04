import { Type } from 'class-transformer';
import {
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { IsAfterField } from '../../common/validators/is-after.validator';

/** US-16 — the window the calendar is showing. */
export class CalendarQueryDto {
  @Type(() => Date)
  @IsDate({ message: 'from must be a valid ISO 8601 date' })
  from: Date;

  @Type(() => Date)
  @IsDate({ message: 'to must be a valid ISO 8601 date' })
  @IsAfterField('from', { message: 'to must be later than from' })
  to: Date;

  /** AC-3: one venue; omitted means every venue the caller manages. */
  @IsOptional()
  @IsString()
  venueId?: string;
}

/** US-16 AC-6 — block out a period on one of the caller's venues. */
export class CreateVenueBlockDto {
  @IsString()
  @IsNotEmpty({ message: 'venueId is required' })
  venueId: string;

  @Type(() => Date)
  @IsDate({ message: 'start must be a valid ISO 8601 date' })
  start: Date;

  @Type(() => Date)
  @IsDate({ message: 'end must be a valid ISO 8601 date' })
  @IsAfterField('start', { message: 'end must be later than start' })
  end: Date;

  @IsString()
  @IsNotEmpty({ message: 'a reason is required to block out time' })
  @MaxLength(500)
  reason: string;
}
