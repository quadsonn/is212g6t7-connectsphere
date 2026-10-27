-- tc-s3-93-setup.sql: two upcoming reservations of the microphones, the later one approved.
--
-- Pre-condition for TC-S3-93 (the warning lists affected reservations, soonest first) (Story 45). Load AFTER tc-s3-88-setup.sql.
--
--   EVT-214 "Later" (1 Nov 2030), RSV-021 2 APPROVED
--   EVT-215 "Sooner" (1 Oct 2030), RSV-022 3 REQUESTED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-214', 'USR-006', 'USR-004', 'Later', 'Purpose', 'Description', 'Conference', '2030-11-01 09:00:00', '2030-11-01 17:00:00', 100, 'Microphones.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-215', 'USR-006', 'USR-004', 'Sooner', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'Microphones.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-021', 'EVT-214', 'EQP-016', 2, '2030-11-01 09:00:00', '2030-11-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-022', 'EVT-215', 'EQP-016', 3, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'REQUESTED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
