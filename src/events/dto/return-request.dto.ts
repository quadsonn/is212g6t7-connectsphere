import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/validators/trim.transform';

/**
 * US-08 AC-2 — a return cannot be confirmed without a reason.
 *
 * The reason here is what the Organiser is being asked to address, so it is
 * stored in clarificationRequest and surfaced by US-05 AC-3.
 */
export class ReturnRequestDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'a reason is required to return this request' })
  @MaxLength(2000)
  reason: string;
}
