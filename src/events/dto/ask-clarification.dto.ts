import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** US-09 AC-1 — the Coordinator's question. */
export class AskClarificationDto {
  @IsString()
  @IsNotEmpty({ message: 'a question is required to request clarification' })
  @MaxLength(4000)
  question: string;
}
