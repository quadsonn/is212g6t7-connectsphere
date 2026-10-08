import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** US-23 AC-3 — approval allows, but does not require, a comment. */
export class ApproveBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/** US-23 AC-2 — a rejection cannot be submitted without a reason. */
export class RejectBookingDto {
  @IsString()
  @IsNotEmpty({ message: 'a reason is required to reject this booking request' })
  @MaxLength(2000)
  reason: string;
}

/**
 * US-23 AC-6 — overturning a decision is its own recorded action, and needs a
 * reason for the same accountability reason a rejection does.
 */
export class ReverseBookingDto {
  @IsString()
  @IsNotEmpty({ message: 'a reason is required to reverse this decision' })
  @MaxLength(2000)
  reason: string;
}
