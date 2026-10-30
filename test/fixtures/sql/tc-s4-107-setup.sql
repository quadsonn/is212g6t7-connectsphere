-- tc-s4-107-setup.sql: two events at the same time, each with its own Coordinator.
--
-- Load AFTER tc-s3-92-setup.sql (Story 67, TC-S4-107).
--
--   EVT-320  "Fair" PLANNING, coordinator2's (USR-049), 1 Oct 2030 09:00-17:00 UTC
--   RSV-049  Gala, 6 x EQP-033, APPROVED; RSV-050 Fair, 4 x EQP-033, APPROVED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "equipmentNeeds", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-320', 'USR-051', 'USR-049', 'Microphones.', 'Fair', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'PLANNING'::"EventStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-049', 'EVT-317', 'EQP-033', 6, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('RSV-050', 'EVT-320', 'EQP-033', 4, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
