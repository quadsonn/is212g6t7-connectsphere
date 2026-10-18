-- tc-s2-13-setup.sql: a heavily booked February 2027 on Main Hall, for the
-- "loads within 2 seconds" check. Every day has three confirmed slots and
-- three pending requests (168 bookings). Confirmed slots never overlap, since
-- the database refuses overlapping APPROVED bookings (Story 23 constraint).
--
-- Pre-condition for TC-S2-13 (Story 17 AC-2). Load AFTER base-users.sql and
-- base-venues.sql. Slots in Singapore time: 08-10, 11-13, 14-16.
--
--   e-s2-busy          APPROVED event "Busy month" by u-organiser
--   b-s2-13-<day>-<slot>-<status>  generated below, fixed values only

INSERT INTO "EventRequest" ("id", "organiserId", "coordinatorId", "name", "purpose", "description", "category",
  "proposedStart", "proposedEnd", "expectedAttendance", "status", "createdAt", "updatedAt") VALUES
  ('e-s2-busy', 'u-organiser', 'u-coordinator-a', 'Busy month', 'Purpose', 'Description', 'Meeting',
     '2027-02-01 00:00:00', '2027-02-01 02:00:00', 30, 'APPROVED'::"EventStatus", '2026-09-02 09:00:00', '2026-09-02 09:00:00');

INSERT INTO "VenueBooking" ("id", "eventId", "venueId", "start", "end", "status", "createdAt", "updatedAt")
SELECT 'b-s2-13-' || d || '-' || s.n || '-' || lower(st.status::text),
       'e-s2-busy', 'v-main-hall',
       DATE '2027-02-01' + (d - 1) + s.start_utc,
       DATE '2027-02-01' + (d - 1) + s.end_utc,
       st.status, TIMESTAMP '2026-09-03 09:00:00', TIMESTAMP '2026-09-03 09:00:00'
FROM generate_series(1, 28) AS d,
     (VALUES (1, TIME '00:00', TIME '02:00'), (2, TIME '03:00', TIME '05:00'), (3, TIME '06:00', TIME '08:00'))
       AS s(n, start_utc, end_utc),
     (VALUES ('APPROVED'::"BookingStatus"), ('REQUESTED'::"BookingStatus")) AS st(status);
