-- tc-s3-119b-setup.sql: a pending change request (CRQ-015): change only the attendance, to 300.
--
-- Pre-condition for TC-S3-119 (Story 48). Load AFTER tc-s3-113-setup.sql.
-- Times are UTC; the event runs 01:00-05:00 on 1 Oct 2030 and a request moves
-- it to the same time on 2 Oct.
--
--   CRQ-015 PENDING, from USR-006, reason "The keynote speaker moved."

INSERT INTO "EventChangeRequest" ("id", "eventId", "requestedById", "status", "reason", "proposedStart", "proposedEnd", "proposedAttendance", "equipmentChanged", "createdAt", "updatedAt") VALUES
  ('CRQ-015', 'EVT-249', 'USR-006', 'PENDING'::"ChangeRequestStatus", 'The keynote speaker moved.', NULL, NULL, 300, false, '2026-09-11 09:00:00', '2026-09-11 09:00:00');
