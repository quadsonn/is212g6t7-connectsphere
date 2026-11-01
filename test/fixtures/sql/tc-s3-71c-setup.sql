-- tc-s3-71c-setup.sql: 2 projectors needed, 1 APPROVED.
--
-- Pre-condition for TC-S3-71 (1 of 2; a catalogue line cannot be ticked) (Story 42). Load AFTER tc-s3-70-setup.sql.
--
--   REQ-009   2 x Projector (catalogue)
--   RSV-016   1 x Projector, APPROVED

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentId", "equipmentType", "quantity", "createdAt", "updatedAt") VALUES
  ('REQ-009', 'EVT-203', 'EQP-013', 'Projector', 2, '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-016', 'EVT-203', 'EQP-013', 1, '2030-11-01 10:00:00', '2030-11-01 14:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
