-- tc-s1-67-setup.sql: two Organisers' events and a draft, for US-02 access control.
--
-- Pre-condition for TC-S1-67 to TC-S1-74 (US-02 AC-1 to AC-8). Load AFTER
-- base-users.sql and tc-s1-22-setup.sql (which adds the second Organiser,
-- USR-007). Each event carries "INTERNAL ..." planning text, so a test can
-- prove an Attendee never receives it.
--
--   EVT-160  CONFIRMED "Event owned by A"  Organiser USR-006, Coordinator USR-004
--   EVT-161  CONFIRMED "Event owned by B"  Organiser USR-007, Coordinator USR-005
--   EVT-162  DRAFT     "Unreviewed draft"  Organiser USR-006, no Coordinator
--
-- Both CONFIRMED events are open for registration (opens 1 Jan 2026, closes
-- 28 Sep 2030) for an event on 1 Oct 2030, so an Attendee can see them now.
-- None has a venue booking, so Venue Staff (RELATED scope) see none of them.

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "layoutNotes", "accessibilityNotes",
  "equipmentNeeds", "registrationEnabled", "registrationOpensAt", "registrationClosesAt",
  "status", "createdAt", "updatedAt") VALUES
  ('EVT-160', 'USR-006', 'USR-004', 'Event owned by A', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 200, 'THEATRE'::"RoomLayout", 'INTERNAL staging notes', 'INTERNAL accessibility planning',
     'INTERNAL equipment planning', true, '2026-01-01 00:00:00', '2030-09-28 00:00:00',
     'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-161', 'USR-007', 'USR-005', 'Event owned by B', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 200, 'THEATRE'::"RoomLayout", 'INTERNAL staging notes', 'INTERNAL accessibility planning',
     'INTERNAL equipment planning', true, '2026-01-01 00:00:00', '2030-09-28 00:00:00',
     'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-162', 'USR-006', NULL, 'Unreviewed draft', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 200, 'THEATRE'::"RoomLayout", 'INTERNAL staging notes', 'INTERNAL accessibility planning',
     'INTERNAL equipment planning', true, NULL, NULL,
     'DRAFT'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
