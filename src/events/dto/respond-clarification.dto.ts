import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

import { Trim } from '../../common/validators/trim.transform';
import { DraftEventRequestDto } from './draft-event-request.dto';

/** US-09 AC-4 — the Organiser's answer. */
export class RespondClarificationDto {
  /** US-58 AC6: trimmed first, so a whitespace-only answer counts as empty. */
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'a response is required' })
  @MaxLength(4000)
  response: string;

  /**
   * US-58 AC3 — request details the Organiser updates along with the answer.
   * The same payload, and so the same validation, as editing the request
   * (PATCH /events/:id); only the keys sent are changed.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => DraftEventRequestDto)
  changes?: DraftEventRequestDto;
}
