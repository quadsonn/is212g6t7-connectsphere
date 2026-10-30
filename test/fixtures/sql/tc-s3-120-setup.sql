-- tc-s3-120-setup.sql: a pending change request (CRQ-017): move conf to 2 Oct with 999 attending.
--
-- Pre-condition for TC-S3-120 (capacity alone never refuses) (Story 48). Load AFTER tc-s3-113-setup.sql.
-- Times are UTC; the event runs 01:00-05:00 on 1 Oct 2030 and a request moves
-- it to the same time on 2 Oct.
--
--   CRQ-017 PENDING, from USR-006, reason "The keynote speaker moved."

INSERT INTO "EventChangeRequest" ("id", "eventId", "requestedById", "status", "reason", "proposedStart", "proposedEnd", "proposedAttendance", "equipmentChanged", "createdAt", "updatedAt") VALUES
  ('CRQ-017', 'EVT-249', 'USR-006', 'PENDING'::"ChangeRequestStatus", 'The keynote speaker moved.', '2030-10-02 01:00:00', '2030-10-02 05:00:00', 999, false, '2026-09-11 09:00:00', '2026-09-11 09:00:00');
