-- tc-s2-19-setup.sql: venues around one slot, 10 Mar 2027 09:00-17:00 Singapore time (01:00-09:00 UTC).
--
-- Pre-condition for TC-S2-19 (Story 18 AC-1). Load AFTER base-users.sql.
-- Every venue is published, managed by u-venue-staff, located on "Campus".
--
--   Approved     APPROVED booking exactly on the slot
--   Pending      REQUESTED booking on the slot
--   Rejected     REJECTED booking on the slot
--   Adjacent     APPROVED booking ending exactly when the slot starts (back-to-back)
--   Untouched    no booking
--   Partial *    one APPROVED booking each, overlapping the slot only partly:
--                starts before / ends after / inside / covers the whole slot

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt") VALUES
  ('v-s2-approved', 'Approved', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-pending', 'Pending', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-rejected', 'Rejected', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-adjacent', 'Adjacent', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-untouched', 'Untouched', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-partial-starts-before', 'Partial starts before', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-partial-ends-after', 'Partial ends after', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-partial-inside', 'Partial inside', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00'),
  ('v-s2-partial-covers', 'Partial covers', 'Campus', 100, 'u-venue-staff', ARRAY[]::"Facility"[], ARRAY[]::"AccessibilityFeature"[], 'PUBLISHED'::"VenueStatus", '2026-09-01 09:00:00', '2026-09-01 09:00:00');

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-19', 'u-organiser', 'u-coordinator-a', 'Some event', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 50, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt") VALUES
  ('b-s2-19-approved', 'e-s2-19', 'v-s2-approved', '2027-03-10 01:00:00', '2027-03-10 09:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-19-pending', 'e-s2-19', 'v-s2-pending', '2027-03-10 01:00:00', '2027-03-10 09:00:00', 'REQUESTED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-19-rejected', 'e-s2-19', 'v-s2-rejected', '2027-03-10 01:00:00', '2027-03-10 09:00:00', 'REJECTED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-19-adjacent', 'e-s2-19', 'v-s2-adjacent', '2027-03-09 23:00:00', '2027-03-10 01:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-19-partial-starts-before', 'e-s2-19', 'v-s2-partial-starts-before', '2027-03-10 00:00:00', '2027-03-10 02:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-19-partial-ends-after', 'e-s2-19', 'v-s2-partial-ends-after', '2027-03-10 08:00:00', '2027-03-10 10:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-19-partial-inside', 'e-s2-19', 'v-s2-partial-inside', '2027-03-10 03:00:00', '2027-03-10 04:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('b-s2-19-partial-covers', 'e-s2-19', 'v-s2-partial-covers', '2027-03-09 23:00:00', '2027-03-10 11:00:00', 'APPROVED'::"BookingStatus", '2026-09-03 09:00:00', '2026-09-03 09:00:00');
