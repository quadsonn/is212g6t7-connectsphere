import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/** The largest buffer accepted: 8 hours (AC-3). */
export const MAX_BUFFER_MINUTES = 480;

/**
 * US-49 AC-3 — a venue's setup and turnaround time, in whole minutes. Used as
 * is by the US-51 preview.
 *
 * Both required: the form always sends the pair, and a missing value is an
 * error rather than "leave unchanged". No @Type(() => Number) on purpose, so
 * "abc" and "30" are rejected instead of being coerced into numbers.
 */
export class VenueBuffersDto {
  @IsInt({ message: 'setupMinutes must be a whole number of minutes' })
  @Min(0, { message: 'setupMinutes must be at least 0' })
  @Max(MAX_BUFFER_MINUTES, { message: `setupMinutes must be at most ${MAX_BUFFER_MINUTES}` })
  setupMinutes!: number;

  @IsInt({ message: 'turnaroundMinutes must be a whole number of minutes' })
  @Min(0, { message: 'turnaroundMinutes must be at least 0' })
  @Max(MAX_BUFFER_MINUTES, { message: `turnaroundMinutes must be at most ${MAX_BUFFER_MINUTES}` })
  turnaroundMinutes!: number;
}

/**
 * US-51 — the save. `confirmConflicts` is "save anyway": without it, a change
 * that makes existing bookings clash is refused with the list (409); with it,
 * the change is saved and those bookings are flagged for review.
 */
export class UpdateVenueBuffersDto extends VenueBuffersDto {
  @IsOptional()
  @IsBoolean({ message: 'confirmConflicts must be true or false' })
  confirmConflicts?: boolean;
}
