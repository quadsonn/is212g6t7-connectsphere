-- tc-s3-93d-setup.sql: Gala's reservations that hold nothing.
--
-- Load AFTER tc-s3-92-setup.sql (TC-S3-93).
--
--   RSV-046  Gala, 9 x EQP-033, RELEASED
--   RSV-047  Gala, 9 x EQP-033, REJECTED
--   RSV-048  Gala, 9 x EQP-033, REQUESTED

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-046', 'EVT-317', 'EQP-033', 9, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'RELEASED'::"ReservationStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('RSV-047', 'EVT-317', 'EQP-033', 9, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'REJECTED'::"ReservationStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('RSV-048', 'EVT-317', 'EQP-033', 9, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'REQUESTED'::"ReservationStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
