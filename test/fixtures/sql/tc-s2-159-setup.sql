-- tc-s2-159-setup.sql: an equipment catalogue and a submitted event with
-- equipment, ready for its Organiser to request a change.
--
-- Pre-condition for TC-S2-159 (Story 36 AC-1), and the base for every other
-- Story 36 and Story 37 test case. Load AFTER base-users.sql.
--
--   EQP-002  "Projector"            (catalogue)
--   EQP-001        "Wireless microphone"  (catalogue)
--   EQP-003     "Projection screen"    (catalogue)
--   EVT-063            SUBMITTED "Tech Talk", USR-006 / USR-004,
--                      1 Oct 2030 09:00-17:00 UTC, 120 expected
--     REQ-003  2 x Projector (from the catalogue), notes "HDMI"
--     REQ-002     1 x "Banner stand" (free text, not in the catalogue)

INSERT INTO "Equipment" ("id", "type", "description", "location", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('EQP-002', 'Projector', 'Ceiling projector', 'AV Store', 6, '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-001', 'Wireless microphone', 'Handheld', 'AV Store', 20, '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('EQP-003', 'Projection screen', NULL, NULL, 4, '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-063', 'USR-006', 'USR-004', 'Tech Talk', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'SUBMITTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentId", "equipmentType", "quantity", "notes", "createdAt", "updatedAt") VALUES
  ('REQ-003', 'EVT-063', 'EQP-002', 'Projector', 2, 'HDMI', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('REQ-002', 'EVT-063', NULL, 'Banner stand', 1, NULL, '2026-09-02 09:01:00', '2026-09-02 09:01:00');
