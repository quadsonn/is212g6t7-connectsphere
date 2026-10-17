import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';

/** US-20 — which event to check the venue against. */
export class VenueSuitabilityQueryDto {
  @IsString()
  @IsNotEmpty({ message: 'eventId is required' })
  eventId!: string;

  /**
   * AC-1: the attendance the Coordinator has entered in the booking form,
   * which may differ from the event's recorded figure. Omitted, the event's
   * own expectedAttendance is used.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'expectedAttendance must be a whole number' })
  @IsPositive({ message: 'expectedAttendance must be greater than zero' })
  expectedAttendance?: number;
}
