import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsPositive, IsString } from 'class-validator';

/**
 * US-32 AC-1 — commit a selected equipment item and quantity to an event.
 *
 * No start/end: the commitment is "for its date and time", so the window is
 * always the event's own proposed times, read server-side.
 */
export class CommitReservationDto {
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsString()
  @IsNotEmpty()
  equipmentId: string;

  @Type(() => Number)
  @IsInt({ message: 'quantity must be a whole number' })
  @IsPositive({ message: 'quantity must be greater than zero' })
  quantity: number;
}
