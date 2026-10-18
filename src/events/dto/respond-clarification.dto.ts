import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/validators/trim.transform';

/** US-09 AC-4 — the Organiser's answer. */
export class RespondClarificationDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'a response is required' })
  @MaxLength(4000)
  response: string;
}
