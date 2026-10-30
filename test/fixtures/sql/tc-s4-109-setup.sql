-- tc-s4-109-setup.sql: an event with no Coordinator yet, holding 9 of the 10 microphones, and a Lead.
--
-- Load AFTER tc-s3-88-setup.sql + tc-s3-88b-setup.sql (Story 67, TC-S4-109).
-- A reservation is made only once an event is in planning, which always has
-- a Coordinator, so the app cannot reach this state: it is seeded directly to
-- prove the Lead fall-back end to end. Same password as the base users.
--
--   USR-052  lead.s4@example.com  Lee Lead  EVENT_COORDINATOR_LEAD
--   EVT-326  "Unassigned" PLANNING, organiser's (USR-051), no Coordinator, 1 Oct 2030 09:00-17:00 UTC
--   RSV-057  Unassigned, 9 x EQP-033, APPROVED

INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt") VALUES
  ('USR-052', 'lead.s4@example.com', '$2b$10$u3vAA/IKRnd4Ng9/Nh34BuyJ6hFQzrt827I9xFWe7pw/zy/rjBUHG', 'Lee Lead', 'EVENT_COORDINATOR_LEAD'::"Role", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "equipmentNeeds", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-326', 'USR-051', NULL, 'Microphones.', 'Unassigned', 'Purpose', 'Description', 'Conference', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'PLANNING'::"EventStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('RSV-057', 'EVT-326', 'EQP-033', 9, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');
