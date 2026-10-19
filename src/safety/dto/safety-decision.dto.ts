import { SafetyOutcome, SafetyReturnStage } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Requirement change 6 — the Safety Officer's decision on one event.
 *
 * One outcome per decision. A rejection or a request for changes must say why;
 * a request for changes must also say which earlier planning stage the event
 * returns to. Those two rules are repeated as CHECK constraints on the table.
 * Comments on the four factors reviewed are optional on every outcome.
 */
export class SafetyDecisionDto {
  @IsEnum(SafetyOutcome, {
    message: 'outcome must be APPROVED, REJECTED or CHANGES_REQUESTED',
  })
  outcome: SafetyOutcome;

  /** Required unless approving; ignored (not stored) when approving. */
  @ValidateIf((dto: SafetyDecisionDto) => dto.outcome !== SafetyOutcome.APPROVED)
  @Transform(trim)
  @IsString({ message: 'reason is required to reject or request changes' })
  @IsNotEmpty({ message: 'reason is required to reject or request changes' })
  @MaxLength(2000)
  reason?: string;

  /** Required exactly when requesting changes: VENUE or TECHNICAL planning. */
  @ValidateIf(
    (dto: SafetyDecisionDto) => dto.outcome === SafetyOutcome.CHANGES_REQUESTED,
  )
  @IsEnum(SafetyReturnStage, {
    message: 'returnStage is required to request changes: VENUE or TECHNICAL',
  })
  returnStage?: SafetyReturnStage;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  emergencyAccessComment?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  crowdMovementComment?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  equipmentPlacementComment?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  accessibilityComment?: string;
}
