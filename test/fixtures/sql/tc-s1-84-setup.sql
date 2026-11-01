-- tc-s1-84-setup.sql: requests for the edges of US-12 (view all details).
--
-- Pre-condition for TC-S1-84 to TC-S1-86 (US-12 AC-2, AC-3). Load AFTER
-- base-users.sql. EVT-153 (tc-s1-54-setup.sql) is the fully filled-in request;
-- these cover what it doesn't.
--
--   EVT-163  SUBMITTED, USR-006's, assigned to USR-004, with NO equipment needs,
--            accessibility or notes, and registration off
--   EVT-164  SUBMITTED, USR-006's, no Coordinator yet (in the Lead's queue)
--   EVT-165  DRAFT, USR-006's, no Coordinator

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "registrationEnabled", "status", "createdAt", "updatedAt") VALUES
  ('EVT-163', 'USR-006', 'USR-004', 'Bare request', 'Purpose', 'Description', 'Conference',
     '2030-11-01 09:00:00', '2030-11-01 17:00:00', 50, false, 'SUBMITTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-164', 'USR-006', NULL, 'Waiting for the Lead', 'Purpose', 'Description', 'Conference',
     '2030-11-02 09:00:00', '2030-11-02 17:00:00', 50, false, 'SUBMITTED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-165', 'USR-006', NULL, 'Unfinished draft', 'Purpose', 'Description', 'Conference',
     '2030-11-03 09:00:00', '2030-11-03 17:00:00', 50, false, 'DRAFT'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');
