import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** US-09 AC-4 — the Organiser's answer. */
export class RespondClarificationDto {
  @IsString()
  @IsNotEmpty({ message: 'a response is required' })
  @MaxLength(4000)
  response: string;
}
