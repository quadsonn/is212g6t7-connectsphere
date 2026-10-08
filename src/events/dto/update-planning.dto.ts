import { Type } from 'class-transformer';
import { AccessibilityFeature, RoomLayout } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinDate,
  ValidateIf,
} from 'class-validator';

/**
 * US-25 AC-1 — the Coordinator's edit to an event in planning.
 *
 * Every field is optional so a single field can be changed on its own, but the
 * event is already past review: a field that submission required (US-03) may
 * be changed, never emptied. Those use ValidateIf rather than IsOptional,
 * because IsOptional also waves through an explicit null — which the
 * EventRequest_complete_unless_draft CHECK constraint would then reject as a
 * 500 instead of a 400 naming the field.
 *
 * Genuinely optional fields (notes, layout, programme) accept null to clear.
 *
 * The end-after-start rule is checked in the service, against the stored value
 * of whichever end was not sent — moving only the start must still be caught.
 */
export class UpdatePlanningDto {
  @ValidateIf((o: UpdatePlanningDto) => o.name !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'name cannot be empty' })
  @MaxLength(200)
  name?: string;

  @ValidateIf((o: UpdatePlanningDto) => o.purpose !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'purpose cannot be empty' })
  @MaxLength(2000)
  purpose?: string;

  @ValidateIf((o: UpdatePlanningDto) => o.description !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'description cannot be empty' })
  @MaxLength(5000)
  description?: string;

  @ValidateIf((o: UpdatePlanningDto) => o.category !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'category cannot be empty' })
  @MaxLength(100)
  category?: string;

  /** US-25 AC-1 names the programme explicitly. */
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  programme?: string | null;

  /** Moving the event into the past is not a planning refinement. */
  @ValidateIf((o: UpdatePlanningDto) => o.proposedStart !== undefined)
  @Type(() => Date)
  @IsDate({ message: 'proposedStart must be a valid ISO 8601 date' })
  @MinDate(() => new Date(), { message: 'proposedStart must be in the future' })
  proposedStart?: Date;

  @ValidateIf((o: UpdatePlanningDto) => o.proposedEnd !== undefined)
  @Type(() => Date)
  @IsDate({ message: 'proposedEnd must be a valid ISO 8601 date' })
  proposedEnd?: Date;

  @ValidateIf((o: UpdatePlanningDto) => o.expectedAttendance !== undefined)
  @IsInt({ message: 'expectedAttendance must be a whole number' })
  @IsPositive({ message: 'expectedAttendance must be greater than zero' })
  @Type(() => Number)
  expectedAttendance?: number;

  @IsOptional()
  @IsEnum(RoomLayout, {
    message: `preferredLayout must be one of: ${Object.values(RoomLayout).join(', ')}`,
  })
  preferredLayout?: RoomLayout | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  layoutNotes?: string | null;

  @ValidateIf((o: UpdatePlanningDto) => o.accessibilityRequirements !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsEnum(AccessibilityFeature, {
    each: true,
    message: `accessibilityRequirements must contain only: ${Object.values(AccessibilityFeature).join(', ')}`,
  })
  accessibilityRequirements?: AccessibilityFeature[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  accessibilityNotes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  equipmentNeeds?: string | null;

  @ValidateIf((o: UpdatePlanningDto) => o.registrationEnabled !== undefined)
  @IsBoolean()
  registrationEnabled?: boolean;
}
