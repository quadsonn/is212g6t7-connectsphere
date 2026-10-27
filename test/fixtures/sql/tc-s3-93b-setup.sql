-- tc-s3-93b-setup.sql: reservations the warning must leave out.
--
-- Pre-condition for TC-S3-93 (Story 45). Load AFTER tc-s3-88-setup.sql.
--
--   RSV-023 RELEASED and RSV-024 REJECTED microphones for the Conference
--   EVT-216 "Past" (1 Jan 2020) with RSV-025 APPROVED microphones
--   EQP-017 Projector (2) with RSV-026 APPROVED for the Conference

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-216', 'USR-006', 'USR-004', 'Past', 'Purpose', 'Description', 'Conference', '2020-01-01 09:00:00', '2020-01-01 17:00:00', 100, 'Microphones.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('EQP-017', 'Projector', 2, '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-023', 'EVT-213', 'EQP-016', 1, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'RELEASED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-024', 'EVT-213', 'EQP-016', 1, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'REJECTED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-025', 'EVT-216', 'EQP-016', 1, '2020-01-01 09:00:00', '2020-01-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-026', 'EVT-213', 'EQP-017', 1, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
