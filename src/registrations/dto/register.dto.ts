import { AccessibilityFeature } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * What a typed number may contain: a "+", then digits and the separators
 * people write them with. Letters are refused rather than interpreted —
 * libphonenumber reads a trailing "x" as an extension and would quietly drop
 * it, accepting "+65 9123 4567x" as a clean number.
 */
const PHONE_CHARACTERS = /^\+[0-9\s().-]+$/;

/**
 * Normalises a valid international number to E.164 ("+65 9123 4567" ->
 * "+6591234567"), so every stored number has one shape. Anything that does not
 * parse is passed through untouched for @IsPhoneNumber to reject with its
 * message.
 */
const toE164 = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!PHONE_CHARACTERS.test(trimmed)) return trimmed;
  const parsed = parsePhoneNumberFromString(trimmed);
  return parsed?.isValid() ? parsed.number : trimmed;
};

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

  /**
   * Any real phone number in international format, from any country. The
   * leading "+" and country code are required: without one the number is
   * ambiguous, and no region is assumed.
   */
  @Transform(toE164)
  @IsString({ message: 'phone is required' })
  @IsNotEmpty({ message: 'phone is required' })
  @Matches(PHONE_CHARACTERS, {
    message:
      'phone must start with + and the country code, and use only digits and spaces',
  })
  @IsPhoneNumber(undefined, {
    message: 'phone must be a real number, e.g. +65 9123 4567',
  })
  phone: string;

  /** A standard option, as on the Organiser's event form. Omitted for none. */
  @IsOptional()
  @IsEnum(AccessibilityFeature, {
    message: 'accessibilityFeature must be one of the listed options',
  })
  accessibilityFeature?: AccessibilityFeature;

  /** The Attendee's own request, or detail beyond the option chosen. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  accessibilityNeeds?: string;
}
