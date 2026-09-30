import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** US-28 AC-1 — one line of required equipment: type and quantity. */
export class EquipmentRequirementDto {
  @IsString()
  @IsNotEmpty({ message: 'equipmentType is required' })
  @MaxLength(100)
  equipmentType: string;

  @IsInt({ message: 'quantity must be a whole number' })
  @IsPositive({ message: 'quantity must be greater than zero' })
  @Max(10000)
  @Type(() => Number)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

/**
 * US-28 — the Coordinator's equipment and technical requirements.
 *
 * `equipment` is the whole list, not a patch to it: the Coordinator edits the
 * list as a table and saves it, so replacing it is what they mean. Either key
 * may be left out to leave that part untouched; an empty list clears it.
 */
export class TechnicalRequirementsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => EquipmentRequirementDto)
  equipment?: EquipmentRequirementDto[];

  /** AC-2 — e.g. on-site assistance, hybrid/video-conferencing setup. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  technicalSupportNeeds?: string | null;
}
