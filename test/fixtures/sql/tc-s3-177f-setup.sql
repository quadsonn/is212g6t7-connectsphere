-- tc-s3-177f-setup.sql: a second event, ready to confirm.
--
-- Pre-condition for TC-S3-177 (longest-waiting first). Load AFTER tc-s3-177-setup.sql.
--
--   EVT-301 "Newer" PLANNING, as EVT-300; BKG-164 APPROVED Main Hall, 3 Oct 2030 09:00-13:00 UTC

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements", "status", "createdAt", "updatedAt") VALUES
  ('EVT-301', 'USR-006', 'USR-004', 'Newer', 'Meet employers', 'Stalls and talks', 'Careers', '2030-10-01 09:00:00', '2030-10-01 13:00:00', 150,
     'THEATRE'::"RoomLayout", ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-164', 'EVT-301', 'VEN-082', '2030-10-03 09:00:00', '2030-10-03 13:00:00', 'APPROVED'::"BookingStatus", 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
