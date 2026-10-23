-- tc-s2-108-setup.sql: microphone reservations over the whole 1 Oct 2030
-- 09:00-17:00 window that hold nothing: requested, rejected and released.
--
-- Pre-condition for TC-S2-108 (Story 29 AC-2). Load AFTER base-users.sql and
-- tc-s2-103-setup.sql.
--
--   RSV-008  REQUESTED 5 x EQP-004
--   RSV-006   REJECTED  5 x EQP-004
--   RSV-007   RELEASED  5 x EQP-004  (released 2026-09-10)

INSERT INTO "EquipmentReservation" ("id", "eventId", "equipmentId", "quantity", "start", "end", "status", "releasedAt", "createdAt", "updatedAt") VALUES
  ('RSV-008', 'EVT-083', 'EQP-004', 5, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'REQUESTED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-006', 'EVT-083', 'EQP-004', 5, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'REJECTED'::"ReservationStatus", NULL, '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('RSV-007', 'EVT-083', 'EQP-004', 5, '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'RELEASED'::"ReservationStatus", '2026-09-10 09:00:00', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
