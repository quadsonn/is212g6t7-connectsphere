-- tc-s3-142b-setup.sql: an event with no Coordinator, with a pending mainHall request.
--
-- Pre-condition for TC-S3-141 (Story 52). Load AFTER tc-s3-141-setup.sql.
-- Times are UTC; the affected booking is 1 Oct 2030 09:00-12:00.
--
--   EVT-272 "unassigned" (no Coordinator) / BKG-151 REQUESTED mainHall

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-272', 'USR-006', NULL, 'unassigned', 'p', 'd', 'c', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Edited on the event after booking.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "preferredLayout", "layoutNotes", "accessibilityRequirements", "accessibilityNotes", "equipmentNeeds", "createdAt", "updatedAt") VALUES
  ('BKG-151', 'EVT-272', 'VEN-073', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'REQUESTED'::"BookingStatus", 80, 'USR-004', 'THEATRE'::"RoomLayout", 'Stage at the front.', ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Two wheelchair users.', 'Two projectors.', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
