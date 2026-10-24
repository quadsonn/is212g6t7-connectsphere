import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * #30 AC-4 — GET /equipment/requirements. By default the list holds only
 * events that can still go ahead; "true" adds the finished ones.
 */
export class RequirementsListQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeFinished?: boolean;
}
