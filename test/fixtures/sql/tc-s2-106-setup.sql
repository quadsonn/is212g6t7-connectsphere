-- tc-s2-106-setup.sql: confirmed reservations overlapping the 1 Oct 2030
-- 09:00-17:00 window, one per item.
--
-- Pre-condition for TC-S2-106 (Story 29 AC-2), and for TC-S2-111 and TC-S2-112.
-- Load AFTER base-users.sql and tc-s2-103-setup.sql.
--
--   r-s2-106-mic  APPROVED 10 x q-s2-mic  12:00-20:00  overlaps the window's end -> 14 of 24 free
--   r-s2-106-pa   APPROVED  4 x q-s2-pa   09:00-17:00  the whole window          ->  2 of 6 free

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "releasedAt", "createdAt", "updatedAt") VALUES
  ('r-s2-106-mic', 'e-s2-industry-night', 'q-s2-mic', 10, '2030-10-01 12:00:00', '2030-10-01 20:00:00', 'APPROVED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('r-s2-106-pa', 'e-s2-industry-night', 'q-s2-pa', 4, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'APPROVED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
