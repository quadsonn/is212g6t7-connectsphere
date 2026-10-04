import { IsNotEmpty, IsString } from 'class-validator';

/** US-20 — which event to check the venue against. */
export class VenueSuitabilityQueryDto {
  @IsString()
  @IsNotEmpty({ message: 'eventId is required' })
  eventId!: string;
}
