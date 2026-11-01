-- tc-s3-145b-setup.sql: showcase also holds eastHall for an afternoon breakout session.
--
-- Pre-condition for TC-S3-145 (only the affected booking is released) (Story 52). Load AFTER tc-s3-141-setup.sql.
-- Times are UTC; the affected booking is 1 Oct 2030 09:00-12:00.
--
--   BKG-152 APPROVED eastHall for showcase, 13:00-15:00

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "preferredLayout", "layoutNotes", "accessibilityRequirements", "accessibilityNotes", "equipmentNeeds", "createdAt", "updatedAt") VALUES
  ('BKG-152', 'EVT-266', 'VEN-074', '2030-10-01 13:00:00', '2030-10-01 15:00:00', 'APPROVED'::"BookingStatus", 80, 'USR-004', 'THEATRE'::"RoomLayout", 'Stage at the front.', ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[], 'Two wheelchair users.', 'Two projectors.', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
