-- tc-s2-109-setup.sql: two confirmed microphone reservations inside the
-- 1 Oct 2030 09:00-17:00 window that never run at the same time.
--
-- Pre-condition for TC-S2-109 (Story 29 AC-2): at most 10 are ever in use, so
-- 14 are free for the whole window (not 4). Load AFTER base-users.sql and
-- tc-s2-103-setup.sql.
--
--   RSV-010    APPROVED 10 x EQP-004  09:00-12:00
--   RSV-009  APPROVED 10 x EQP-004  13:00-17:00

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "releasedAt", "createdAt", "updatedAt") VALUES
  ('RSV-010', 'EVT-083', 'EQP-004', 10, '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'APPROVED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-009', 'EVT-083', 'EQP-004', 10, '2030-10-01 13:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
