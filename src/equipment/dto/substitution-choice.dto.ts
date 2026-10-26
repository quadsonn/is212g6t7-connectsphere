import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Technical Support's answer for one reservation of an item going out of
 * service on a CONFIRMED event: a replacement item (same quantity as the
 * reservation), or `noAlternative` when nothing in the catalogue fits. Exactly
 * one of the two — substitutionPlanError() enforces it.
 */
export class SubstitutionChoiceDto {
  @IsString()
  @IsNotEmpty()
  reservationId: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  alternativeEquipmentId?: string;

  @IsOptional()
  @IsBoolean()
  noAlternative?: boolean;
}

/** The same answer for a single reservation: the body of POST …/substitution. */
export class SuggestSubstitutionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  alternativeEquipmentId?: string;

  @IsOptional()
  @IsBoolean()
  noAlternative?: boolean;
}
