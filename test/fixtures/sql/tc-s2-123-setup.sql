-- tc-s2-123-setup.sql: events equipment must not be committed to.
--
-- Pre-condition for TC-S2-123 (Story 31 AC-1). Load AFTER base-users.sql and
-- tc-s2-122-setup.sql. All 1 Oct 2030 09:00-17:00.
--
--   EVT-098      DRAFT
--   EVT-099   REJECTED
--   EVT-096  CANCELLED
--   EVT-097  COMPLETED

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-098', 'USR-006', 'USR-004', 'Not live (draft)', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'Six wireless microphones and a PA system.', 'DRAFT'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-099', 'USR-006', 'USR-004', 'Not live (rejected)', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'Six wireless microphones and a PA system.', 'REJECTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-096', 'USR-006', 'USR-004', 'Not live (cancelled)', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'Six wireless microphones and a PA system.', 'CANCELLED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-097', 'USR-006', 'USR-004', 'Not live (completed)', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'Six wireless microphones and a PA system.', 'COMPLETED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
