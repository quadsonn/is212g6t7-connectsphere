import { IsNotEmpty, IsString } from 'class-validator';

/**
 * US-10 — the Coordinator to link as the event's main point of contact.
 *
 * The target's existence and role are checked in the service, not here: a DTO
 * can validate shape but cannot ask the database whether this id belongs to a
 * user who is actually a Coordinator.
 */
export class AssignCoordinatorDto {
  @IsString()
  @IsNotEmpty({ message: 'coordinatorId is required' })
  coordinatorId: string;
}
