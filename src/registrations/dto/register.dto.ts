import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * US-34 AC-2 — the registration form. Name and email come from the attendee's
 * account, so the form asks only for what the account lacks. Missing or
 * invalid fields fail validation, which blocks the submission with a message
 * per field.
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @Transform(trim)
  @IsString({ message: 'phone is required' })
  @IsNotEmpty({ message: 'phone is required' })
  @Matches(/^\+?[0-9][0-9 ()-]{6,18}[0-9]$/, {
    message: 'phone must be a valid phone number',
  })
  phone: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  dietaryRequirements?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  accessibilityNeeds?: string;
}
