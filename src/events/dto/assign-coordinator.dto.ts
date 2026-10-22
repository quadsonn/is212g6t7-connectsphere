import { IsNotEmpty, IsString } from 'class-validator';

/**
 * The Coordinator the Lead assigns a queued request to, or reassigns an event
 * to — the event's main point of contact.
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
