import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * US-38 AC-3 — rejecting a change request needs a reason, which the Organiser
 * then reads on their event.
 */
export class RejectChangeRequestDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'reason is required' })
  @MaxLength(2000)
  reason: string;
}
