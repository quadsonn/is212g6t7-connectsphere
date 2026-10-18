-- tc-s2-151-setup.sql: u-attendee's registrations before and after their
-- withdrawal cutoff, and one already withdrawn.
--
-- Pre-condition for TC-S2-151 (Story 35 AC-1), and the base for TC-S2-152 to
-- TC-S2-157. Load AFTER base-users.sql. All CONFIRMED with registration open
-- (1 Jan 2026 - 28 Sep 2030), 1 Oct 2030.
--
--   e-s2-dinner  "Charity Dinner",  withdrawal cutoff 30 Sep 2030 (still ahead)
--   e-s2-late    "Late Lecture",    withdrawal cutoff 1 Jan 2020 (passed)
--   e-s2-left    "Film Night",      registration already withdrawn
--   g-s2-dinner  u-attendee, REGISTERED
--   g-s2-late    u-attendee, REGISTERED
--   g-s2-left    u-attendee, WITHDRAWN on 10 Sep 2026

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "registrationEnabled", "registrationOpensAt", "registrationClosesAt",
  "withdrawalCutoffAt", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-dinner', 'u-organiser', 'u-coordinator-a', 'Charity Dinner', 'Purpose', 'Description', 'Social',
     '2030-10-01 18:00:00', '2030-10-01 22:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', '2030-09-30 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-late', 'u-organiser', 'u-coordinator-a', 'Late Lecture', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 11:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', '2020-01-01 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('e-s2-left', 'u-organiser', 'u-coordinator-a', 'Film Night', 'Purpose', 'Description', 'Social',
     '2030-10-01 19:00:00', '2030-10-01 21:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', NULL, 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "Registration" ("id", "eventId", "attendeeId", "status", "phone", "withdrawnAt", "createdAt", "updatedAt") VALUES
  ('g-s2-dinner', 'e-s2-dinner', 'u-attendee', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('g-s2-late', 'e-s2-late', 'u-attendee', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('g-s2-left', 'e-s2-left', 'u-attendee', 'WITHDRAWN'::"RegistrationStatus", '+65 9123 4567', '2026-09-10 09:00:00', '2026-09-05 09:00:00', '2026-09-05 09:00:00');
