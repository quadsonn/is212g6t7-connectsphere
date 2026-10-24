import { IsNotEmpty, IsString } from 'class-validator';

/**
 * US-61 — the Technical Support member the Coordinator assigns to an event.
 *
 * As with AssignCoordinatorDto, the target's existence, role and availability
 * are checked in the service: a DTO can validate shape, not the database.
 */
export class AssignTechnicalSupportDto {
  @IsString()
  @IsNotEmpty({ message: 'staffId is required' })
  staffId: string;
}
