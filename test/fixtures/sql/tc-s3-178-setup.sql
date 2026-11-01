-- tc-s3-178-setup.sql: 2 microphones requested and reserved for the Careers Fair.
--
-- Pre-condition for TC-S3-178 (the review shows the equipment) and TC-S3-182
-- (returning to technical planning). Load AFTER tc-s3-177-setup.sql.
--
--   REQ-016 EVT-300 needs 2 Wireless microphones; RSV-034 APPROVED 2 of EQP-022, 1 Oct 2030 09:00-13:00 UTC

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentId", "equipmentType", "quantity", "createdAt", "updatedAt") VALUES
  ('REQ-016', 'EVT-300', 'EQP-022', 'Wireless microphone', 2, '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-034', 'EVT-300', 'EQP-022', 2, '2030-10-01 09:00:00', '2030-10-01 13:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
