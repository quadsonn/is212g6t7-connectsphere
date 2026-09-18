import { RoomLayout } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * US-13 AC-1/AC-2 — creating or editing a venue draft.
 *
 * Every field optional: AC-2 requires an incomplete venue to save. As with
 * event drafts (US-04), the line is drawn at completeness (not enforced) vs
 * type correctness (enforced) — a capacity of "lots" is wrong, not merely
 * missing.
 */
export class VenueDraftDto {
  /**
   * US-14 AC-4: an empty or whitespace-only value means "cleared", not "set to
   * an empty string" — otherwise a blanked field would satisfy NOT NULL while
   * being blank to a human.
   */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  )
  @IsString()
  @MaxLength(200)
  name?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  )
  @IsString()
  @MaxLength(300)
  location?: string | null;

  @IsOptional()
  @IsInt({ message: 'capacity must be a whole number' })
  @IsPositive({ message: 'capacity must be greater than zero' })
  @Type(() => Number)
  capacity?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  facilities?: string[];

  /** Free text, deliberately not the US-06 request enum — see the schema note. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  accessibilityFeatures?: string[];

  /** US-13 — the shared US-06 lookup. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(RoomLayout, {
    each: true,
    message: `supportedLayouts must contain only: ${Object.values(RoomLayout).join(', ')}`,
  })
  supportedLayouts?: RoomLayout[];

  /** AC-1 "operating hours", carried as free text. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  operatingInfo?: string;
}
