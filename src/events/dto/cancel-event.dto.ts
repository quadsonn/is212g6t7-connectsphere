import { Transform } from 'class-transformer';
import { Equals, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * US-43 AC-2 — a cancellation needs a reason, and the Organiser must have
 * confirmed it. The confirmation is a field rather than a UI-only dialog so the
 * API cannot be called to cancel an event by accident.
 */
export class CancelEventDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'a reason is required to cancel this event' })
  @MaxLength(2000)
  reason: string;

  @Equals(true, { message: 'the cancellation must be confirmed' })
  confirm: boolean;
}
