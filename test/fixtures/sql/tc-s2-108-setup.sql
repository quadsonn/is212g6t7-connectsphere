-- tc-s2-108-setup.sql: microphone reservations over the whole 1 Oct 2030
-- 09:00-17:00 window that hold nothing: requested, rejected and released.
--
-- Pre-condition for TC-S2-108 (Story 29 AC-2). Load AFTER base-users.sql and
-- tc-s2-103-setup.sql.
--
--   r-s2-108-requested  REQUESTED 5 x q-s2-mic
--   r-s2-108-rejected   REJECTED  5 x q-s2-mic
--   r-s2-108-released   RELEASED  5 x q-s2-mic  (released 2026-09-10)

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "releasedAt", "createdAt", "updatedAt") VALUES
  ('r-s2-108-requested', 'e-s2-industry-night', 'q-s2-mic', 5, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'REQUESTED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('r-s2-108-rejected', 'e-s2-industry-night', 'q-s2-mic', 5, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'REJECTED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('r-s2-108-released', 'e-s2-industry-night', 'q-s2-mic', 5, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'RELEASED'::"ReservationStatus", '2026-09-10 09:00:00', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
