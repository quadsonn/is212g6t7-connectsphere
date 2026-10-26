-- tc-s2-19-setup.sql: venues around one slot, 10 Mar 2027 09:00-17:00 Singapore time (01:00-09:00 UTC).
--
-- Pre-condition for TC-S2-19 (Story 18 AC-1). Load AFTER base-users.sql.
-- Every venue is published, managed by USR-010, located on "Campus".
--
--   Approved     APPROVED booking exactly on the slot
--   Pending      REQUESTED booking on the slot
--   Rejected     REJECTED booking on the slot
--   Adjacent     APPROVED booking ending exactly when the slot starts (back-to-back)
--   Untouched    no booking
--   Partial *    one APPROVED booking each, overlapping the slot only partly:
--                starts before / ends after / inside / covers the whole slot

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('VEN-012', 'Approved', 'Campus', 100, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-029', 'Pending', 'Campus', 100, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-030', 'Rejected', 'Campus', 100, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-010', 'Adjacent', 'Campus', 100, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-037', 'Untouched', 'Campus', 100, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-028', 'Partial starts before', 'Campus', 100, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-026', 'Partial ends after', 'Campus', 100, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-027', 'Partial inside', 'Campus', 100, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('VEN-025', 'Partial covers', 'Campus', 100, 'USR-010', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-027', 'USR-006', 'USR-004', 'Some event', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 50, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('BKG-020', 'EVT-027', 'VEN-012', '2027-03-10 01:00:00', '2027-03-10 09:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-025', 'EVT-027', 'VEN-029', '2027-03-10 01:00:00', '2027-03-10 09:00:00', 'REQUESTED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-026', 'EVT-027', 'VEN-030', '2027-03-10 01:00:00', '2027-03-10 09:00:00', 'REJECTED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-019', 'EVT-027', 'VEN-010', '2027-03-09 23:00:00', '2027-03-10 01:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-024', 'EVT-027', 'VEN-028', '2027-03-10 00:00:00', '2027-03-10 02:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-022', 'EVT-027', 'VEN-026', '2027-03-10 08:00:00', '2027-03-10 10:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-023', 'EVT-027', 'VEN-027', '2027-03-10 03:00:00', '2027-03-10 04:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-021', 'EVT-027', 'VEN-025', '2027-03-09 23:00:00', '2027-03-10 11:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
