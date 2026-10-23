-- tc-s2-178-setup.sql: a pending request to change an event's equipment list.
--
-- Pre-condition for TC-S2-178 (Story 37 AC-4). Load AFTER base-users.sql,
-- base-venues.sql, tc-s2-159-setup.sql and tc-s2-172-setup.sql.
--
--   EVT-069   PLANNING "Robotics Expo", USR-004, with
--                 2 x Projector (catalogue, notes "HDMI") and 1 x "Banner stand" (free text)
--   CRQ-004     PENDING, equipment -> 3 x Projector + 4 x Wireless microphone, "Live demo needs mics"

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-069', 'USR-006', 'USR-004', 'Robotics Expo', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EquipmentRequirement" ("id", "eventId", "equipmentId", "equipmentType", "quantity", "notes", "createdAt", "updatedAt") VALUES
  ('REQ-006', 'EVT-069', 'EQP-002', 'Projector', 2, 'HDMI', '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('REQ-005', 'EVT-069', NULL, 'Banner stand', 1, NULL, '2026-09-02 09:01:00', '2026-09-02 09:01:00');

INSERT INTO "EventChangeRequest" ("id", "eventId", "requestedById", "status", "reason", "proposedStart", "proposedEnd",
  "proposedAttendance", "equipmentChanged", "decidedById", "decidedAt", "decisionReason", "createdAt", "updatedAt") VALUES
  ('CRQ-004', 'EVT-069', 'USR-006', 'PENDING'::"ChangeRequestStatus", 'Live demo needs mics', NULL, NULL,
     NULL, true, NULL, NULL, NULL, '2026-09-11 09:00:00', '2026-09-11 09:00:00');

INSERT INTO "EventChangeRequestEquipment" ("id", "changeRequestId", "equipmentId", "quantity") VALUES
  ('CRE-002', 'CRQ-004', 'EQP-002', 3),
  ('CRE-001', 'CRQ-004', 'EQP-001', 4);
