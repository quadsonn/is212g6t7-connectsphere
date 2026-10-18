import { EquipmentStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
}
