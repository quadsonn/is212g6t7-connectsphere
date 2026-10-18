-- tc-s2-172-setup.sql: change requests waiting for review, on events assigned
-- to u-coordinator-a and to u-coordinator-b, plus one already decided.
--
-- Pre-condition for TC-S2-172 (Story 37 AC-1), and the base for TC-S2-173 to
-- TC-S2-180. Load AFTER base-users.sql, base-venues.sql and tc-s2-159-setup.sql.
--
--   b-s2-cr       APPROVED booking for e-s2-cr ("Tech Talk") on Main Hall (capacity 300)
--   e-s2-cr-dates PLANNING "Open House", u-coordinator-a, 1 Oct 2030 09:00-17:00
--   e-s2-cr-theirs PLANNING "Casey's Event", u-coordinator-b
--   cr-s2-dates      PENDING  e-s2-cr-dates: move to 2 Oct 2030 09:00-17:00, "Clashes with exams"     submitted 8 Sep 2026
--   cr-s2-attendance PENDING  e-s2-cr: attendance 120 -> 350, "More sign-ups than expected"       submitted 10 Sep 2026
--   cr-s2-theirs     PENDING  e-s2-cr-theirs (u-coordinator-b's): attendance 200                    submitted 5 Sep 2026
--   cr-s2-decided    REJECTED e-s2-cr-dates: attendance 90, rejected by u-coordinator-a 9 Sep 2026

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('b-s2-cr', 'e-s2-cr', 'v-main-hall', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"BookingStatus", 120, 'u-coordinator-a', '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-cr-dates', 'u-organiser', 'u-coordinator-a', 'Open House', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-cr-theirs', 'u-organiser', 'u-coordinator-b', 'Casey''s Event', 'Purpose', 'Description', 'Conference',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 120, 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "EventChangeRequest" ("id", "eventId", "requestedById", "status", "reason", "proposedStart", "proposedEnd",
  "proposedAttendance", "equipmentChanged", "decidedById", "decidedAt", "decisionReason", "createdAt", "updatedAt") VALUES
  ('cr-s2-dates', 'e-s2-cr-dates', 'u-organiser', 'PENDING'::"ChangeRequestStatus", 'Clashes with exams', '2030-10-02 09:00:00', '2030-10-02 17:00:00',
     NULL, false, NULL, NULL, NULL, '2026-09-08 09:00:00', '2026-09-08 09:00:00'),
  ('cr-s2-attendance', 'e-s2-cr', 'u-organiser', 'PENDING'::"ChangeRequestStatus", 'More sign-ups than expected', NULL, NULL,
     350, false, NULL, NULL, NULL, '2026-09-10 09:00:00', '2026-09-10 09:00:00'),
  ('cr-s2-theirs', 'e-s2-cr-theirs', 'u-organiser', 'PENDING'::"ChangeRequestStatus", 'Bigger audience', NULL, NULL,
     200, false, NULL, NULL, NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('cr-s2-decided', 'e-s2-cr-dates', 'u-organiser', 'REJECTED'::"ChangeRequestStatus", 'Fewer people', NULL, NULL,
     90, false, 'u-coordinator-a', '2026-09-09 09:00:00', 'Too close to the date', '2026-09-01 09:00:00', '2026-09-01 09:00:00');
