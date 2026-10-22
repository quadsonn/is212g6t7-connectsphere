-- US-64: the Safety Officer alert is named for what it says — a check is due.
-- Renames the value added by 20261022090000_us64_us65_notification_types.
-- A rename keeps every notification already stored with it; nothing is converted.
ALTER TYPE "NotificationType" RENAME VALUE 'SAFETY_CHECK_REQUESTED' TO 'SAFETY_CHECK_DUE';
