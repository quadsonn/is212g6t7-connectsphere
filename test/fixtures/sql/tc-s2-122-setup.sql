-- tc-s2-122-setup.sql: equipment and four events placed around one another, for
-- committing (Story 31) and releasing (Story 32) reservations.
--
-- Pre-condition for TC-S2-122 (Story 31 AC-1), and the base for TC-S2-123 to
-- TC-S2-134. Load AFTER base-users.sql. No reservations: the tests commit them.
--
--   EQP-009        "Wireless microphone"  10  AV Store  OPERATIONAL
--   EQP-010         "Portable PA system"    4            OPERATIONAL
--   EQP-011  "Projector (4K)"        8            UNDER_MAINTENANCE
--   EVT-060       PLANNING "Capstone Showcase"  1 Oct 2030 09:00-17:00 (the main event), USR-004
--   EVT-082       PLANNING "Industry Night"     1 Oct 2030 12:00-20:00 (overlaps it)
--   EVT-093          PLANNING "Evening Mixer"      1 Oct 2030 17:00-21:00 (back-to-back)
--   EVT-055         PLANNING "Alumni Day"         2 Oct 2030 09:00-17:00 (next day)

INSERT INTO "Equipment" ("id", "type", "location", "totalQuantity", "operationalStatus", "createdAt", "updatedAt") VALUES
  ('EQP-009', 'Wireless microphone', 'AV Store', 10, 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-010', 'Portable PA system', NULL, 4, 'OPERATIONAL'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-011', 'Projector (4K)', NULL, 8, 'UNDER_MAINTENANCE'::"EquipmentStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-060', 'USR-006', 'USR-004', 'Capstone Showcase', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 100, 'Six wireless microphones and a PA system.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-082', 'USR-006', 'USR-004', 'Industry Night', 'Purpose', 'Description', 'Conference',
     '2030-10-01 12:00:00', '2030-10-01 20:00:00', 100, 'Six wireless microphones and a PA system.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-093', 'USR-006', 'USR-004', 'Evening Mixer', 'Purpose', 'Description', 'Conference',
     '2030-10-01 17:00:00', '2030-10-01 21:00:00', 100, 'Six wireless microphones and a PA system.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-055', 'USR-006', 'USR-004', 'Alumni Day', 'Purpose', 'Description', 'Conference',
     '2030-10-02 09:00:00', '2030-10-02 17:00:00', 100, 'Six wireless microphones and a PA system.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
