-- tc-s2-134-setup.sql: a reservation for the Capstone Showcase that was
-- already released earlier.
--
-- Pre-condition for TC-S2-134 (Story 32 AC-4): cancelling must not release it
-- again or move its release time. Load AFTER base-users.sql and tc-s2-122-setup.sql.
--
--   r-s2-134-old  RELEASED 2 x q-s2-res-mic, released 2030-01-01 00:00 UTC

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "releasedAt", "createdAt", "updatedAt") VALUES
  ('r-s2-134-old', 'e-s2-capstone', 'q-s2-res-mic', 2, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'RELEASED'::"ReservationStatus", '2030-01-01 00:00:00', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
