import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * US-08 AC-2 — a rejection cannot be confirmed without a reason.
 *
 * Separate from ReturnRequestDto despite the identical shape: the two are
 * distinct decisions, and a distinct message tells the Coordinator which one
 * they failed to complete.
 */
export class RejectRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'a reason is required to reject this request' })
  @MaxLength(2000)
  reason: string;
}
