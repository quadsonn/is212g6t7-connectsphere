import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/validators/trim.transform';

/** US-09 AC-1 — the Coordinator's question. */
export class AskClarificationDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'a question is required to request clarification' })
  @MaxLength(4000)
  question: string;
}
