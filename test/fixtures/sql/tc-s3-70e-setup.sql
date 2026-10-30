-- tc-s3-70e-setup.sql: 2 projectors needed, and 2 only REQUESTED.
--
-- Pre-condition for TC-S3-70 (a requested reservation is not a reservation) (Story 42). Load AFTER tc-s3-70b-setup.sql.
--
--   REQ-010   2 x Projector (catalogue)
--   RSV-017   2 x Projector, REQUESTED

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentId", "equipmentType", "quantity", "createdAt", "updatedAt") VALUES
  ('REQ-010', 'EVT-203', 'EQP-013', 'Projector', 2, '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-017', 'EVT-203', 'EQP-013', 2, '2030-11-01 10:00:00', '2030-11-01 14:00:00', 'REQUESTED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
