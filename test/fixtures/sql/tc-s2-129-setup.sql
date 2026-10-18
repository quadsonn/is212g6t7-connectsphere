-- tc-s2-129-setup.sql: a submitted event with no Coordinator assigned yet.
--
-- Pre-condition for TC-S2-129 (Story 31): equipment can still be committed,
-- with nobody to notify. Load AFTER base-users.sql and tc-s2-122-setup.sql.
--
--   e-s2-unassigned  SUBMITTED "Unassigned", no Coordinator, 1 Oct 2030 09:00-17:00

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-unassigned', 'u-organiser', NULL, 'Unassigned', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'Six wireless microphones and a PA system.', 'SUBMITTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
