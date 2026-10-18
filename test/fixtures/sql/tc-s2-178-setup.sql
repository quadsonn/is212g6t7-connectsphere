-- tc-s2-178-setup.sql: a pending request to change an event's equipment list.
--
-- Pre-condition for TC-S2-178 (Story 37 AC-4). Load AFTER base-users.sql,
-- base-venues.sql, tc-s2-159-setup.sql and tc-s2-172-setup.sql.
--
--   e-s2-cr-kit   PLANNING "Robotics Expo", u-coordinator-a, with
--                 2 x Projector (catalogue, notes "HDMI") and 1 x "Banner stand" (free text)
--   cr-s2-kit     PENDING, equipment -> 3 x Projector + 4 x Wireless microphone, "Live demo needs mics"

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-cr-kit', 'u-organiser', 'u-coordinator-a', 'Robotics Expo', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentId", "equipmentType", "quantity", "notes", "createdAt", "updatedAt") VALUES
  ('rq-s2-kit-projector', 'e-s2-cr-kit', 'q-s2-cr-projector', 'Projector', 2, 'HDMI', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('rq-s2-kit-banner', 'e-s2-cr-kit', NULL, 'Banner stand', 1, NULL, '2026-09-02 09:01:00', '2026-09-02 09:01:00');

INSERT INTO "EventChangeRequest" ("id", "eventId", "requestedById", "status", "reason", "proposedStart", "proposedEnd",
  "proposedAttendance", "equipmentChanged", "decidedById", "decidedAt", "decisionReason", "createdAt", "updatedAt") VALUES
  ('cr-s2-kit', 'e-s2-cr-kit', 'u-organiser', 'PENDING'::"ChangeRequestStatus", 'Live demo needs mics', NULL, NULL,
     NULL, true, NULL, NULL, NULL, '2026-09-11 09:00:00', '2026-09-11 09:00:00');

INSERT INTO "EventChangeRequestEquipment" ("id", "changeRequestId", "equipmentId", "quantity") VALUES
  ('cre-s2-kit-projector', 'cr-s2-kit', 'q-s2-cr-projector', 3),
  ('cre-s2-kit-mic', 'cr-s2-kit', 'q-s2-cr-mic', 4);
