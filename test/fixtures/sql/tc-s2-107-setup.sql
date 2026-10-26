-- tc-s2-107-setup.sql: confirmed microphone reservations that do NOT overlap
-- the 1 Oct 2030 09:00-17:00 window.
--
-- Pre-condition for TC-S2-107 (Story 29 AC-2). Load AFTER base-users.sql and
-- tc-s2-103-setup.sql.
--
--   RSV-004    APPROVED 10 x EQP-004  1 Oct 05:00-09:00  ends as the window starts
--   RSV-003     APPROVED 10 x EQP-004  1 Oct 17:00-19:00  starts as the window ends
--   RSV-005  APPROVED 10 x EQP-004  2 Oct 09:00-17:00

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "releasedAt", "createdAt", "updatedAt") VALUES
  ('RSV-004', 'EVT-083', 'EQP-004', 10, '2030-10-01 05:00:00', '2030-10-01 09:00:00', 'APPROVED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-003', 'EVT-083', 'EQP-004', 10, '2030-10-01 17:00:00', '2030-10-01 19:00:00', 'APPROVED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-005', 'EVT-083', 'EQP-004', 10, '2030-10-02 09:00:00', '2030-10-02 17:00:00', 'APPROVED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
