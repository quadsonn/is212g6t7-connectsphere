import { Expose, Type } from 'class-transformer';
import { IsOptional, Matches } from 'class-validator';

import { DayStatus } from '../availability';

/**
 * US-17 — which days of a venue's calendar to load.
 *
 * Either one `month` or a `from`/`to` day range; neither means the current
 * and next month (AC-1). The cross-field rules (not both, range length) are
 * checked in resolveRange, since they span parameters.
 */
export class VenueAvailabilityQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

/**
 * US-17 AC-3 — the only shape availability leaves the server in.
 *
 * Serialised with excludeExtraneousValues, so a property is sent only if it
 * is @Expose'd here. Adding a field to the aggregation cannot leak it to a
 * Coordinator; someone has to add it to this class on purpose.
 */
export class DayAvailabilityDto {
  @Expose()
  date!: string;

  @Expose()
  status!: DayStatus;
}

/**
 * US-50 AC-3 — one part of what a booking occupies: its setup time, the event
 * time itself, or its turnaround time. Shown separately on the calendar.
 */
export class OccupancySegmentDto {
  @Expose()
  kind!: 'SETUP' | 'EVENT' | 'TURNAROUND';

  @Expose()
  start!: Date;

  @Expose()
  end!: Date;
}

/**
 * US-50 AC-3 — one booking's occupancy of the venue, anonymous like the rest
 * of US-17: when, and whether tentative or booked — never which event. Only
 * @Expose'd properties leave the server.
 */
export class VenueOccupancyDto {
  @Expose()
  status!: DayStatus;

  @Expose()
  @Type(() => OccupancySegmentDto)
  segments!: OccupancySegmentDto[];
}
