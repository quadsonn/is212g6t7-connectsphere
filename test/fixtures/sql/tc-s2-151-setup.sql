-- tc-s2-151-setup.sql: USR-001's registrations before and after their
-- withdrawal cutoff, and one already withdrawn.
--
-- Pre-condition for TC-S2-151 (Story 35 AC-1), and the base for TC-S2-152 to
-- TC-S2-157. Load AFTER base-users.sql. All CONFIRMED with registration open
-- (1 Jan 2026 - 28 Sep 2030), 1 Oct 2030.
--
--   EVT-073  "Charity Dinner",  withdrawal cutoff 30 Sep 2030 (still ahead)
--   EVT-086    "Late Lecture",    withdrawal cutoff 1 Jan 2020 (passed)
--   EVT-088    "Film Night",      registration already withdrawn
--   REG-002  USR-001, REGISTERED
--   REG-006    USR-001, REGISTERED
--   REG-007    USR-001, WITHDRAWN on 10 Sep 2026

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "registrationEnabled", "registrationOpensAt", "registrationClosesAt",
  "withdrawalCutoffAt", "status", "createdAt", "updatedAt") VALUES
  ('EVT-073', 'USR-006', 'USR-004', 'Charity Dinner', 'Purpose', 'Description', 'Social',
     '2030-10-01 18:00:00', '2030-10-01 22:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', '2030-09-30 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-086', 'USR-006', 'USR-004', 'Late Lecture', 'Purpose', 'Description', 'Social',
     '2030-10-01 09:00:00', '2030-10-01 11:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', '2020-01-01 00:00:00', 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-088', 'USR-006', 'USR-004', 'Film Night', 'Purpose', 'Description', 'Social',
     '2030-10-01 19:00:00', '2030-10-01 21:00:00', 100, true, '2026-01-01 00:00:00', '2030-09-28 00:00:00', NULL, 'CONFIRMED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "Registration" ("id", "eventId", "attendeeId", "status", "phone", "withdrawnAt", "createdAt", "updatedAt") VALUES
  ('REG-002', 'EVT-073', 'USR-001', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('REG-006', 'EVT-086', 'USR-001', 'REGISTERED'::"RegistrationStatus", '+65 9123 4567', NULL, '2026-09-05 09:00:00', '2026-09-05 09:00:00'),
  ('REG-007', 'EVT-088', 'USR-001', 'WITHDRAWN'::"RegistrationStatus", '+65 9123 4567', '2026-09-10 09:00:00', '2026-09-05 09:00:00', '2026-09-05 09:00:00');
