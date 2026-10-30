-- tc-s3-120b-setup.sql: rival holds 5 projectors at the new time.
--
-- Pre-condition for TC-S3-120 (Story 48). Load AFTER tc-s3-113-setup.sql.
-- Times are UTC; the event runs 01:00-05:00 on 1 Oct 2030 and a request moves
-- it to the same time on 2 Oct.
--
--   RSV-033 5 projectors for rival, 2 Oct

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-033', 'EVT-250', 'EQP-019', 5, '2030-10-02 01:00:00', '2030-10-02 05:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
