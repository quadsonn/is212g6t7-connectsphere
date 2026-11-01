-- tc-s3-94-setup.sql: two confirmed events holding 5 projectors each, at the same time.
--
-- Pre-condition for every test in test/equipment-shortage.e2e-spec.ts
-- (Story 45, TC-S3-93 to 98; Story 67, TC-S4-110). Load AFTER tc-s3-88-setup.sql.
--
--   EQP-034  Projector x10; EQP-035 Laser projector x4; EQP-036 Screen x1
--   EVT-322  "Gala" CONFIRMED, coordinator's (USR-048), tech2 assigned (USR-047), 1 Oct 2030 09:00-17:00 UTC
--   EVT-323  "Fair" CONFIRMED, the same
--   RSV-052  Gala, 5 x Projector, APPROVED; RSV-053 Fair, 5 x Projector, APPROVED

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('EQP-034', 'Projector', 10, '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-035', 'Laser projector', 4, '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-036', 'Screen', 1, '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "technicalSupportId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-322', 'USR-051', 'USR-048', 'USR-047', 'Gala', 'p', 'd', 'c', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'CONFIRMED'::"EventStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EVT-323', 'USR-051', 'USR-048', 'USR-047', 'Fair', 'p', 'd', 'c', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'CONFIRMED'::"EventStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-052', 'EVT-322', 'EQP-034', 5, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('RSV-053', 'EVT-323', 'EQP-034', 5, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
