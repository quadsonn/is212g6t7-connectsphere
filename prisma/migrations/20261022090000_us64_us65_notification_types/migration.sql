-- US-64: every Safety Officer is told when an event enters AWAITING_SAFETY_CHECK.
-- US-65: the Organiser is told when a Coordinator is assigned to, or reassigned
-- on, their event. Added together; US-65 sends it.
-- Adding enum values converts no existing data.
ALTER TYPE "NotificationType" ADD VALUE 'SAFETY_CHECK_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'COORDINATOR_ASSIGNED';
