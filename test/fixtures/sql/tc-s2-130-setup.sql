-- tc-s2-130-setup.sql: a still-pending and a rejected reservation for the
-- Capstone Showcase.
--
-- Pre-condition for TC-S2-130 (Story 32 AC-1): cancelling releases the pending
-- one and leaves the rejected one alone. Load AFTER base-users.sql and
-- tc-s2-122-setup.sql.
--
--   r-s2-130-pending   REQUESTED 1 x q-s2-res-mic
--   r-s2-130-rejected  REJECTED  1 x q-s2-res-pa

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "releasedAt", "createdAt", "updatedAt") VALUES
  ('r-s2-130-pending', 'e-s2-capstone', 'q-s2-res-mic', 1, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'REQUESTED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('r-s2-130-rejected', 'e-s2-capstone', 'q-s2-res-pa', 1, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'REJECTED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
