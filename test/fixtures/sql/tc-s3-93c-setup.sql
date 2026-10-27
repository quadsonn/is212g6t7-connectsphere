-- tc-s3-93c-setup.sql: 2 microphones APPROVED for the Conference.
--
-- Pre-condition for TC-S3-93 and TC-S3-94 (Story 45). Load AFTER tc-s3-88-setup.sql.
--
--   RSV-027 2 APPROVED microphones for EVT-213

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-027', 'EVT-213', 'EQP-016', 2, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
