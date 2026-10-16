import { Transform } from 'class-transformer';

/**
 * Trims surrounding whitespace from a string before validation runs.
 *
 * @IsNotEmpty() only rejects '', so without this a reason of '   ' passes as
 * "entered" while saying nothing (US-08 AC-2, US-09 AC-1, US-03 AC-3). Put it
 * above @IsNotEmpty() so the blank value is what gets validated — and stored.
 * Non-strings pass through untouched for @IsString() to reject.
 */
export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
