-- tc-s2-74-setup.sql: a projector reservation for the tc-s2-68 event, still
-- REQUESTED, and a second planning event nobody has booked anything for.
--
-- Pre-condition for TC-S2-74 (Story 24 AC-3) and TC-S2-94 (Story 27 AC-3): Technical Support see the event
-- through the reservation, and staff never see the unrelated event.
-- Load AFTER base-users.sql and tc-s2-68-setup.sql.
--
--   q-s2-projector     "Projector", 4 in stock
--   r-s2-74-requested  REQUESTED, 2 projectors for e-s2-planning
--   e-s2-unrelated     PLANNING "Unrelated event", u-coordinator-a, no booking or reservation

INSERT INTO "Equipment" ("id", "type", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('q-s2-projector', 'Projector', 4, '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('r-s2-74-requested', 'e-s2-planning', 'q-s2-projector', 2, '2030-10-01 08:00:00', '2030-10-01 18:00:00', 'REQUESTED'::"ReservationStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-unrelated', 'u-organiser', 'u-coordinator-a', 'Unrelated event', 'Welcome new students', 'Full-day programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 320, 'Two projectors', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
