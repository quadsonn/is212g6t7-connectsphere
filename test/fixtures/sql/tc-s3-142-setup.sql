-- tc-s3-142-setup.sql: another Coordinator's event, booked at eastHall.
--
-- Pre-condition for TC-S3-141 (only the affected Coordinator is told) (Story 52). Load AFTER tc-s3-141-setup.sql.
-- Times are UTC; the affected booking is 1 Oct 2030 09:00-12:00.
--
--   EVT-271 "otherEvent" (Coordinator USR-005) / BKG-150 APPROVED eastHall

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category", "proposedStart", "proposedEnd", "expectedAttendance", "preferredLayout", "accessibilityRequirements", "equipmentNeeds", "status", "createdAt", "updatedAt") VALUES
  ('EVT-271', 'USR-006', 'USR-005', 'otherEvent', 'p', 'd', 'c', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 80, 'THEATRE'::"RoomLayout", ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Edited on the event after booking.', 'PLANNING'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "preferredLayout", "layoutNotes", "accessibilityRequirements", "accessibilityNotes", "equipmentNeeds", "createdAt", "updatedAt") VALUES
  ('BKG-150', 'EVT-271', 'VEN-074', '2030-10-01 09:00:00', '2030-10-01 12:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004', 'THEATRE'::"RoomLayout", 'Stage at the front.', ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Two wheelchair users.', 'Two projectors.', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
