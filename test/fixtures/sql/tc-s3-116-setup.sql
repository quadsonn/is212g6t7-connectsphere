-- tc-s3-116-setup.sql: a pending change request (CRQ-013): move conf to 2 Oct and add 2 microphones.
--
-- Pre-condition for TC-S3-116 (Story 48). Load AFTER tc-s3-113-setup.sql.
-- Times are UTC; the event runs 01:00-05:00 on 1 Oct 2030 and a request moves
-- it to the same time on 2 Oct.
--
--   CRQ-013 PENDING, from USR-006, reason "The keynote speaker moved."

INSERT INTO "EventChangeRequest" ("id", "eventId", "requestedById", "status", "reason", "proposedStart", "proposedEnd", "proposedAttendance", "equipmentChanged", "createdAt", "updatedAt") VALUES
  ('CRQ-013', 'EVT-249', 'USR-006', 'PENDING'::"ChangeRequestStatus", 'The keynote speaker moved.', '2030-10-02 01:00:00', '2030-10-02 05:00:00', NULL, true, '2026-09-11 09:00:00', '2026-09-11 09:00:00');

INSERT INTO "EventChangeRequestEquipment" ("id", "changeRequestId", "equipmentId", "quantity") VALUES
  ('CRE-006', 'CRQ-013', 'EQP-020', 2);
