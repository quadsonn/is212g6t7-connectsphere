import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The Coordinator sending an event back for a new safety check.
 *
 * The comment is optional: it is the Coordinator's chance to tell the Safety
 * Officer what they changed, or why they believe the concern is met. A blank
 * comment is treated as none.
 */
export class ResubmitSafetyDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
