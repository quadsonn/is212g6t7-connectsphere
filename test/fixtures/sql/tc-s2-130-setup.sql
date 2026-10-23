-- tc-s2-130-setup.sql: a still-pending and a rejected reservation for the
-- Capstone Showcase.
--
-- Pre-condition for TC-S2-130 (Story 32 AC-1): cancelling releases the pending
-- one and leaves the rejected one alone. Load AFTER base-users.sql and
-- tc-s2-122-setup.sql.
--
--   RSV-011   REQUESTED 1 x EQP-009
--   RSV-012  REJECTED  1 x EQP-010

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "releasedAt", "createdAt", "updatedAt") VALUES
  ('RSV-011', 'EVT-060', 'EQP-009', 1, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'REQUESTED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-012', 'EVT-060', 'EQP-010', 1, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'REJECTED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00');
