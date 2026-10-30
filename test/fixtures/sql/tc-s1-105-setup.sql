-- tc-s1-105-setup.sql: bookings on the base venues, for US-14 AC-3 (Venue
-- Staff are told when an edit may affect existing bookings).
--
-- Pre-condition for TC-S1-105 and TC-S1-107. Load AFTER base-users.sql and
-- base-venues.sql. One booking per venue, so each test picks the case it
-- needs by venue. All times UTC.
--
--   BKG-001  Main Hall (VEN-002)        2030-10-01 08:00-18:00  APPROVED  upcoming   "Orientation"
--   BKG-002  Seminar Room (VEN-038)     2020-01-01 08:00-18:00  APPROVED  finished   "Past seminar"
--   BKG-003  Rooftop Terrace (VEN-004)  2030-10-02 18:00-23:00  REJECTED  upcoming   "Rejected party"

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('EVT-166', 'USR-006', 'USR-004', 'Orientation', 'Welcome', 'Programme', 'Student engagement',
     '2030-10-01 09:00:00', '2030-10-01 17:00:00', 250, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00'),
  ('EVT-167', 'USR-006', 'USR-004', 'Past seminar', 'Purpose', 'Description', 'Talk',
     '2020-01-01 09:00:00', '2020-01-01 17:00:00', 30, 'COMPLETED'::"EventStatus", '2019-12-01 09:00:00', '2019-12-01 09:00:00'),
  ('EVT-168', 'USR-006', 'USR-004', 'Rejected party', 'Purpose', 'Description', 'Social',
     '2030-10-02 18:00:00', '2030-10-02 23:00:00', 100, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "expectedAttendance", "requestedById", "createdAt", "updatedAt") VALUES
  ('BKG-001', 'EVT-166', 'VEN-002', '2030-10-01 08:00:00', '2030-10-01 18:00:00',
     'APPROVED'::"BookingStatus", 250, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00'),
  ('BKG-002', 'EVT-167', 'VEN-038', '2020-01-01 08:00:00', '2020-01-01 18:00:00',
     'APPROVED'::"BookingStatus", 30, 'USR-004', '2019-12-02 09:00:00', '2019-12-02 09:00:00'),
  ('BKG-003', 'EVT-168', 'VEN-004', '2030-10-02 18:00:00', '2030-10-02 23:00:00',
     'REJECTED'::"BookingStatus", 100, 'USR-004', '2026-09-03 09:00:00', '2026-09-03 09:00:00');
