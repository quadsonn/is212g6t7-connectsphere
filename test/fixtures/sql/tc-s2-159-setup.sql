-- tc-s2-159-setup.sql: an equipment catalogue and a submitted event with
-- equipment, ready for its Organiser to request a change.
--
-- Pre-condition for TC-S2-159 (Story 36 AC-1), and the base for every other
-- Story 36 and Story 37 test case. Load AFTER base-users.sql.
--
--   q-s2-cr-projector  "Projector"            (catalogue)
--   q-s2-cr-mic        "Wireless microphone"  (catalogue)
--   q-s2-cr-screen     "Projection screen"    (catalogue)
--   e-s2-cr            SUBMITTED "Tech Talk", u-organiser / u-coordinator-a,
--                      1 Oct 2030 09:00-17:00 UTC, 120 expected
--     rq-s2-cr-projector  2 x Projector (from the catalogue), notes "HDMI"
--     rq-s2-cr-banner     1 x "Banner stand" (free text, not in the catalogue)

INSERT INTO "Equipment" ("id", "type", "description", "location", "totalQuantity", "createdAt", "updatedAt") VALUES
  ('q-s2-cr-projector', 'Projector', 'Ceiling projector', 'AV Store', 6, '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('q-s2-cr-mic', 'Wireless microphone', 'Handheld', 'AV Store', 20, '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('q-s2-cr-screen', 'Projection screen', NULL, NULL, 4, '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-cr', 'u-organiser', 'u-coordinator-a', 'Tech Talk', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'SUBMITTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentId", "equipmentType", "quantity", "notes", "createdAt", "updatedAt") VALUES
  ('rq-s2-cr-projector', 'e-s2-cr', 'q-s2-cr-projector', 'Projector', 2, 'HDMI', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('rq-s2-cr-banner', 'e-s2-cr', NULL, 'Banner stand', 1, NULL, '2026-09-02 09:01:00', '2026-09-02 09:01:00');
