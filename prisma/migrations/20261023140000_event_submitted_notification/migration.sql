-- Notify Coordinator Leads when a new or resubmitted event request is submitted.
-- (The change-request notice reuses the existing EVENT_CHANGE_REQUESTED value.)
ALTER TYPE "NotificationType" ADD VALUE 'EVENT_SUBMITTED';
