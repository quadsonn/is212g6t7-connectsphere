-- tc-s3-177g-setup.sql: the microphones are released while the event waits for its check.
--
-- Pre-condition for TC-S3-177 (an event leaves the queue once its equipment is
-- no longer reserved). Load AFTER tc-s3-178-setup.sql, once the event is queued.
--
--   RSV-034: RELEASED

UPDATE "EquipmentReservation" SET "status" = 'RELEASED'::"ReservationStatus", "releasedAt" = '2026-09-05 09:00:00' WHERE "id" = 'RSV-034';
