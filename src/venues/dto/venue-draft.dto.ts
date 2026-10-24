import { AccessibilityFeature, Facility, RoomLayout } from '@prisma/client';
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

import { Trim } from '../../common/validators/trim.transform';

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
   * being blank to a human. A real value is stored trimmed (audit gap #1).
   */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @MaxLength(200)
  name?: string | null;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @MaxLength(300)
  location?: string | null;

  @IsOptional()
  @IsInt({ message: 'capacity must be a whole number' })
  @IsPositive({ message: 'capacity must be greater than zero' })
  @Type(() => Number)
  capacity?: number | null;

  /** US-18 — the Facility vocabulary, so search can match it exactly. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Facility, {
    each: true,
    message: `facilities must contain only: ${Object.values(Facility).join(', ')}`,
  })
  facilities?: Facility[];

  /** US-18 — anything a venue offers beyond the Facility list. */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @MaxLength(1000)
  facilityNotes?: string | null;

  /** US-18 — the same AccessibilityFeature enum an Organiser requests from. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(AccessibilityFeature, {
    each: true,
    message: `accessibilityFeatures must contain only: ${Object.values(AccessibilityFeature).join(', ')}`,
  })
  accessibilityFeatures?: AccessibilityFeature[];

  /** US-18 — accessibility provision beyond the vocabulary (e.g. braille signage). */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @MaxLength(1000)
  accessibilityNotes?: string | null;

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
  @Trim()
  @IsString()
  @MaxLength(500)
  operatingInfo?: string;
}
