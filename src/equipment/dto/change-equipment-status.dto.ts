import { EquipmentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

const STATUS_VALUES = Object.values(EquipmentStatus).join(', ');

/**
 * US-45 — move a number of an item's units from one status to another: mark
 * working units Damaged or Under Maintenance (AC-1), or set them back to
 * Available once repaired (AC-3).
 */
export class ChangeEquipmentStatusDto {
  /** The status the units are in now. */
  @IsEnum(EquipmentStatus, { message: `from must be one of: ${STATUS_VALUES}` })
  from: EquipmentStatus;

  /** The status they move to. */
  @IsEnum(EquipmentStatus, { message: `to must be one of: ${STATUS_VALUES}` })
  to: EquipmentStatus;

  @Type(() => Number)
  @IsInt({ message: 'quantity must be a whole number' })
  @Min(1, { message: 'quantity must be at least 1' })
  quantity: number;

  /** AC-2: no change is saved without a reason. Trimmed, so blank is empty. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'a reason is required to change the status' })
  @IsNotEmpty({ message: 'a reason is required to change the status' })
  @MaxLength(2000)
  reason: string;
}

/**
 * US-45 AC-5 — the warning before saving: a proposed move to preview the
 * shortage it would cause. All three are optional; without them the current
 * shortage is reported.
 */
export class ProposedStatusMoveDto {
  @IsOptional()
  @IsEnum(EquipmentStatus, { message: `from must be one of: ${STATUS_VALUES}` })
  from?: EquipmentStatus;

  @IsOptional()
  @IsEnum(EquipmentStatus, { message: `to must be one of: ${STATUS_VALUES}` })
  to?: EquipmentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'quantity must be a whole number' })
  @Min(1, { message: 'quantity must be at least 1' })
  quantity?: number;
}
