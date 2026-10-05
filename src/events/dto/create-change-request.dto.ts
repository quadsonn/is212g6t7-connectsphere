import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { IsAfterField } from '../../common/validators/is-after.validator';

/** US-37 — one line of the proposed equipment list, from the catalogue. */
export class ChangeRequestEquipmentDto {
  @IsString()
  @IsNotEmpty({ message: 'equipmentId is required' })
  equipmentId: string;

  @IsInt({ message: 'quantity must be a whole number' })
  @IsPositive({ message: 'quantity must be greater than zero' })
  @Max(10000)
  @Type(() => Number)
  quantity: number;
}

/**
 * US-37 — an Organiser's proposed change to an event.
 *
 * Every proposed field is optional: send only what should change. That the
 * request changes at least one thing, and that dates are not in the past, are
 * checked against the event in change-request.rules.ts — they need the event's
 * current values, which a DTO does not have.
 *
 * `equipment` is the complete list the event should end up with, so adding,
 * removing and changing a quantity are all the same shape: an empty list means
 * "remove everything".
 */
export class CreateChangeRequestDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'reason is required' })
  @MaxLength(2000)
  reason: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'proposedStart must be a valid ISO 8601 date' })
  proposedStart?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'proposedEnd must be a valid ISO 8601 date' })
  @IsAfterField('proposedStart', {
    message: 'proposedEnd must be later than proposedStart',
  })
  proposedEnd?: Date;

  @IsOptional()
  @IsInt({ message: 'proposedAttendance must be a whole number' })
  @IsPositive({ message: 'proposedAttendance must be greater than zero' })
  @Type(() => Number)
  proposedAttendance?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChangeRequestEquipmentDto)
  equipment?: ChangeRequestEquipmentDto[];
}
