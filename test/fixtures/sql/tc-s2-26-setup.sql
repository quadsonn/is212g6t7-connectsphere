-- tc-s2-26-setup.sql: a realistic catalogue for the "within 2 seconds" check:
-- 300 venues (every 10th a draft) and 600 bookings around 10 Mar 2027.
--
-- Pre-condition for TC-S2-26 (Story 18 AC-7). Load AFTER base-users.sql.
-- All values are fixed: generated from the row number, never from the clock.
--
--   VEN-101 .. VEN-400   "Venue 000".."Venue 299", capacity 20..510,
--                        facilities and accessibility vary by row number
--   BKG-301 .. BKG-900   per venue: one APPROVED booking, and one
--                        REQUESTED booking three hours later

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-029', 'USR-006', 'USR-004', 'Some event', 'Purpose', 'Description', 'Talk',
     '2027-03-10 01:00:00', '2027-03-10 09:00:00', 50, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "Venue" ("id", "name", "location", "capacity", "managedById", "facilities", "accessibilityFeatures", "status", "createdAt", "updatedAt")
SELECT 'VEN-' || (101 + i),
       'Venue ' || lpad(i::text, 3, '0'),
       'Campus',
       20 + (i % 50) * 10,
       'USR-010',
       CASE i % 3 WHEN 0 THEN ARRAY['PROJECTOR', 'STAGE', 'WIFI']::"Facility"[]
                  WHEN 1 THEN ARRAY['SCREEN', 'MICROPHONE']::"Facility"[]
                  ELSE ARRAY['SOUND_SYSTEM']::"Facility"[] END,
       CASE i % 2 WHEN 0 THEN ARRAY['STEP_FREE_ACCESS', 'HEARING_LOOP']::"AccessibilityFeature"[]
                  ELSE ARRAY['WHEELCHAIR_SEATING']::"AccessibilityFeature"[] END,
       CASE WHEN i % 10 = 0 THEN 'DRAFT'::"VenueStatus" ELSE 'PUBLISHED'::"VenueStatus" END,
       TIMESTAMP '2026-09-01 09:00:00', TIMESTAMP '2026-09-01 09:00:00'
FROM generate_series(0, 299) AS i;

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt")
SELECT 'BKG-' || (301 + i * 2 + k),
       'EVT-029',
       'VEN-' || (101 + i),
       TIMESTAMP '2027-03-10 01:00:00' + make_interval(hours => (i % 5) - 2 + k * 3),
       TIMESTAMP '2027-03-10 09:00:00' + make_interval(hours => (i % 5) - 2 + k * 3),
       CASE k WHEN 0 THEN 'APPROVED'::"BookingStatus" ELSE 'REQUESTED'::"BookingStatus" END,
       TIMESTAMP '2026-09-03 09:00:00', TIMESTAMP '2026-09-03 09:00:00'
FROM generate_series(0, 299) AS i, generate_series(0, 1) AS k;
