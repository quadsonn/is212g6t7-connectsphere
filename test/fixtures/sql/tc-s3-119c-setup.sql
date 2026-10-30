-- tc-s3-119c-setup.sql: an event with no arrangements, and a request to move it.
--
-- Pre-condition for TC-S3-119 (nothing to rebook) (Story 48). Load AFTER tc-s3-113-setup.sql.
-- Times are UTC; the event runs 01:00-05:00 on 1 Oct 2030 and a request moves
-- it to the same time on 2 Oct.
--
--   EVT-251 "bare" CONFIRMED, no bookings or reservations; CRQ-016 PENDING, to 2 Oct

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-251', 'USR-006', 'USR-004', 'bare', 'p', 'd', 'c', '2030-10-01 01:00:00', '2030-10-01 05:00:00', 100, 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EventChangeRequest" ("id", "eventId", "requestedById", "status", "reason", "proposedStart", "proposedEnd", "proposedAttendance", "equipmentChanged", "createdAt", "updatedAt") VALUES
  ('CRQ-016', 'EVT-251', 'USR-006', 'PENDING'::"ChangeRequestStatus", 'The keynote speaker moved.', '2030-10-02 01:00:00', '2030-10-02 05:00:00', NULL, false, '2026-09-11 09:00:00', '2026-09-11 09:00:00');
