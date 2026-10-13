import { IsInt, Max, Min } from 'class-validator';

/** The largest buffer accepted: 8 hours (AC-3). */
export const MAX_BUFFER_MINUTES = 480;

/**
 * US-49 AC-3 — a venue's setup and turnaround time, in whole minutes.
 *
 * Both required: the form always sends the pair, and a missing value is an
 * error rather than "leave unchanged". No @Type(() => Number) on purpose, so
 * "abc" and "30" are rejected instead of being coerced into numbers.
 */
export class UpdateVenueBuffersDto {
  @IsInt({ message: 'setupMinutes must be a whole number of minutes' })
  @Min(0, { message: 'setupMinutes must be at least 0' })
  @Max(MAX_BUFFER_MINUTES, { message: `setupMinutes must be at most ${MAX_BUFFER_MINUTES}` })
  setupMinutes!: number;

  @IsInt({ message: 'turnaroundMinutes must be a whole number of minutes' })
  @Min(0, { message: 'turnaroundMinutes must be at least 0' })
  @Max(MAX_BUFFER_MINUTES, { message: `turnaroundMinutes must be at most ${MAX_BUFFER_MINUTES}` })
  turnaroundMinutes!: number;
}
