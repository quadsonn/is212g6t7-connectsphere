-- tc-s2-107-setup.sql: confirmed microphone reservations that do NOT overlap
-- the 1 Oct 2030 09:00-17:00 window.
--
-- Pre-condition for TC-S2-107 (Story 29 AC-2). Load AFTER base-users.sql and
-- tc-s2-103-setup.sql.
--
--   r-s2-107-before    APPROVED 10 x q-s2-mic  1 Oct 05:00-09:00  ends as the window starts
--   r-s2-107-after     APPROVED 10 x q-s2-mic  1 Oct 17:00-19:00  starts as the window ends
--   r-s2-107-next-day  APPROVED 10 x q-s2-mic  2 Oct 09:00-17:00

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "releasedAt", "createdAt", "updatedAt") VALUES
  ('r-s2-107-before', 'e-s2-industry-night', 'q-s2-mic', 10, '2030-10-01 05:00:00', '2030-10-01 09:00:00', 'APPROVED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('r-s2-107-after', 'e-s2-industry-night', 'q-s2-mic', 10, '2030-10-01 17:00:00', '2030-10-01 19:00:00', 'APPROVED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('r-s2-107-next-day', 'e-s2-industry-night', 'q-s2-mic', 10, '2030-10-02 09:00:00', '2030-10-02 17:00:00', 'APPROVED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
