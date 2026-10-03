import { AccessibilityFeature, Facility } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

import { IsAfterField } from '../../common/validators/is-after.validator';

/**
 * Query-string lists arrive as "A,B", as a repeated key (?x=A&x=B), or as a
 * single value. All three become a clean array.
 */
const toList = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === '') return undefined;
  const parts = (Array.isArray(value) ? value : [value]).flatMap((v) =>
    String(v).split(','),
  );
  return parts.map((v) => v.trim()).filter(Boolean);
};

/**
 * US-18 — open search over published venues.
 *
 * Every parameter is optional; one that is absent places no constraint on
 * that dimension (an empty search returns the whole published catalogue).
 * Active parameters combine with AND (AC-5).
 */
export class VenueSearchDto {
  /**
   * US-15 AC-3 (restored after US-18) — case-insensitive substring match on
   * the venue name, exactly as GET /venues?search= does. Not a US-18
   * criterion: it keeps the name lookup Coordinators already had, which moving
   * their page onto this endpoint would otherwise have removed.
   *
   * AMBIGUOUS: combined with the other filters by AND, like every dimension
   * here (AC-5). Worth confirming with the customer.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  name?: string;

  /**
   * AC-1 — the slot the venue must be free for, as ISO 8601 instants. Given
   * together or not at all (checked in the service, which spans both).
   *
   * AMBIGUOUS: the story offers date + startTime + endTime *or* a combined
   * range; the range is used because it states the timezone explicitly. The
   * frontend composes it from a date and two times in Singapore time.
   */
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'from must be an ISO 8601 date-time' })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'to must be an ISO 8601 date-time' })
  @IsAfterField('from', { message: 'to must be later than from' })
  to?: string;

  /** AC-2 — capacity at least this. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'minCapacity must be a whole number' })
  @IsPositive({ message: 'minCapacity must be greater than zero' })
  minCapacity?: number;

  /** AC-3 — the venue must offer every one of these. */
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayUnique()
  @IsEnum(AccessibilityFeature, {
    each: true,
    message: `accessibility must contain only: ${Object.values(AccessibilityFeature).join(', ')}`,
  })
  accessibility?: AccessibilityFeature[];

  /** AC-4 — the venue must offer every one of these. */
  @IsOptional()
  @Transform(toList)
  @IsArray()
  @ArrayUnique()
  @IsEnum(Facility, {
    each: true,
    message: `facilities must contain only: ${Object.values(Facility).join(', ')}`,
  })
  facilities?: Facility[];
}
