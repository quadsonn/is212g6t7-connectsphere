import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsPositive, IsString, MaxLength } from 'class-validator';

/** Trimmed, so a blank reason is empty and refused. */
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class WithReason {
  @Transform(trim)
  @IsString({ message: 'a reason is required' })
  @IsNotEmpty({ message: 'a reason is required' })
  @MaxLength(2000)
  reason: string;
}

/** US-45 — reduce a reservation to `quantity` units, with a reason. */
export class ReduceReservationDto extends WithReason {
  @Type(() => Number)
  @IsInt({ message: 'quantity must be a whole number' })
  @IsPositive({ message: 'quantity must be greater than zero' })
  quantity: number;
}

/** US-45 — release a reservation entirely, with a reason. */
export class ReleaseReservationDto extends WithReason {}

/**
 * US-45 — suggest `quantity` units of another item in place of the same
 * number of the short reservation's, with a reason.
 */
export class SuggestAlternativeDto extends WithReason {
  @IsString()
  @IsNotEmpty({ message: 'choose the alternative equipment item' })
  alternativeEquipmentId: string;

  @Type(() => Number)
  @IsInt({ message: 'quantity must be a whole number' })
  @IsPositive({ message: 'quantity must be greater than zero' })
  quantity: number;
}

/** US-45 — the quantity the alternatives must be available in. */
export class AlternativesQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'quantity must be a whole number' })
  @IsPositive({ message: 'quantity must be greater than zero' })
  quantity: number;
}
