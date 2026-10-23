-- tc-s2-172-setup.sql: change requests waiting for review, on events assigned
-- to USR-004 and to USR-005, plus one already decided.
--
-- Pre-condition for TC-S2-172 (Story 37 AC-1), and the base for TC-S2-173 to
-- TC-S2-180. Load AFTER base-users.sql, base-venues.sql and tc-s2-159-setup.sql.
--
--   BKG-057       APPROVED booking for EVT-063 ("Tech Talk") on Main Hall (capacity 300)
--   EVT-067 PLANNING "Open House", USR-004, 1 Oct 2030 09:00-17:00
--   EVT-072 PLANNING "Casey's Event", USR-005
--   CRQ-002      PENDING  EVT-067: move to 2 Oct 2030 09:00-17:00, "Clashes with exams"     submitted 8 Sep 2026
--   CRQ-001 PENDING  EVT-063: attendance 120 -> 350, "More sign-ups than expected"       submitted 10 Sep 2026
--   CRQ-005     PENDING  EVT-072 (USR-005's): attendance 200                    submitted 5 Sep 2026
--   CRQ-003    REJECTED EVT-067: attendance 90, rejected by USR-004 9 Sep 2026

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-057', 'EVT-063', 'VEN-002', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"BookingStatus", 120, 'USR-004', '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-067', 'USR-006', 'USR-004', 'Open House', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-072', 'USR-006', 'USR-005', 'Casey''s Event', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EventChangeRequest" ("id", "eventId", "requestedById", "status", "reason", "proposedStart", "proposedEnd",
  "proposedAttendance", "equipmentChanged", "decidedById", "decidedAt", "decisionReason", "createdAt", "updatedAt") VALUES
  ('CRQ-002', 'EVT-067', 'USR-006', 'PENDING'::"ChangeRequestStatus", 'Clashes with exams', '2030-10-02 09:00:00', '2030-10-02 17:00:00',
     NULL, false, NULL, NULL, NULL, '2026-09-08 09:00:00', '2026-09-08 09:00:00'),
  ('CRQ-001', 'EVT-063', 'USR-006', 'PENDING'::"ChangeRequestStatus", 'More sign-ups than expected', NULL, NULL,
     350, false, NULL, NULL, NULL, '2026-09-10 09:00:00', '2026-09-10 09:00:00'),
  ('CRQ-005', 'EVT-072', 'USR-006', 'PENDING'::"ChangeRequestStatus", 'Bigger audience', NULL, NULL,
     200, false, NULL, NULL, NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('CRQ-003', 'EVT-067', 'USR-006', 'REJECTED'::"ChangeRequestStatus", 'Fewer people', NULL, NULL,
     90, false, 'USR-004', '2026-09-09 09:00:00', 'Too close to the date', '2026-09-01 09:00:00', '2026-09-01 09:00:00');
