import { EquipmentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { SubstitutionChoiceDto } from './substitution-choice.dto';

/**
 * US-45 — mark an item Damaged or Under Maintenance (AC-1), or back to
 * Available once repaired (AC-3).
 */
export class ChangeEquipmentStatusDto {
  @IsEnum(EquipmentStatus, {
    message: `status must be one of: ${Object.values(EquipmentStatus).join(', ')}`,
  })
  status: EquipmentStatus;

  /** AC-2: no change is saved without a reason. Trimmed, so blank is empty. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'a reason is required to change the status' })
  @IsNotEmpty({ message: 'a reason is required to change the status' })
  @MaxLength(2000)
  reason: string;

  /**
   * Required for every reservation of this item on a CONFIRMED event when the
   * item is taken out of use: a replacement, or "no valid alternative".
   * Reservations on events that have not reached CONFIRMED need none.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubstitutionChoiceDto)
  substitutions?: SubstitutionChoiceDto[];
}
