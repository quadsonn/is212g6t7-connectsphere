-- tc-s3-83e-setup.sql: 2 wireless microphones reserved for the Gala.
--
-- Pre-condition for TC-S3-83 (equipment released too) and the rollback test (Story 44). Load AFTER tc-s3-83-setup.sql.
--
--   EQP-015 Wireless microphone, 10 in stock; RSV-020 2 APPROVED for EVT-194, 18:00-22:00

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('EQP-015', 'Wireless microphone', 10, '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-020', 'EVT-194', 'EQP-015', 2, '2030-10-01 18:00:00', '2030-10-01 22:00:00', 'APPROVED'::"ReservationStatus", '2026-09-04 09:00:00', '2026-09-04 09:00:00');
