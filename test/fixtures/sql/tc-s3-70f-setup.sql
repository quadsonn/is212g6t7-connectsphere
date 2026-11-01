-- tc-s3-70f-setup.sql: 2 projectors needed, and 2 APPROVED.
--
-- Pre-condition for TC-S3-70 (fully reserved is ready) (Story 42). Load AFTER tc-s3-70b-setup.sql.
--
--   REQ-012   2 x Projector (catalogue)
--   RSV-018   2 x Projector, APPROVED

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentId", "equipmentType", "quantity", "createdAt", "updatedAt") VALUES
  ('REQ-012', 'EVT-203', 'EQP-013', 'Projector', 2, '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-018', 'EVT-203', 'EQP-013', 2, '2030-11-01 10:00:00', '2030-11-01 14:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
