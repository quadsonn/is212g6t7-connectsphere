-- tc-s3-173-setup.sql: what an event carries when it is reassigned.
--
-- Pre-condition for TC-S3-173. Load AFTER tc-s3-170-setup.sql.
--
--   VEN-081 "Hall", Block A, 500
--   BKG-160 REQUESTED Hall for EVT-296, 1 Oct 2030 09:00-17:00 UTC, requested by Marcus
--   CLM-001 "A question" from Olive on EVT-296
--   CRQ-018 PENDING from Olive on EVT-296: "More people are coming", 150 people

INSERT INTO "Venue" ("id", "name", "location", "capacity", "createdAt", "updatedAt") VALUES
  ('VEN-081', 'Hall', 'Block A', 500, '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-160', 'EVT-296', 'VEN-081', '2030-10-01 09:00:00', '2030-10-01 17:00:00', 'REQUESTED'::"BookingStatus", 'USR-030', '2026-09-03 09:00:00', '2026-09-03 09:00:00');

INSERT INTO "ClarificationMessage" ("id", "eventId", "authorId", "body", "createdAt") VALUES
  ('CLM-001', 'EVT-296', 'USR-028', 'A question', '2026-09-03 09:00:00');

INSERT INTO "EventChangeRequest" ("id", "eventId", "requestedById", "status", "reason", "proposedAttendance", "createdAt", "updatedAt") VALUES
  ('CRQ-018', 'EVT-296', 'USR-028', 'PENDING'::"ChangeRequestStatus", 'More people are coming', 150, '2026-09-04 09:00:00', '2026-09-04 09:00:00');
