-- tc-s4-80-setup.sql: the Safety Officer asked for venue changes, and the Coordinator has since edited the plan.
--
-- Pre-condition for the Story 62 browser test (e2e/us62-safety-resubmit.spec.ts).
-- Load AFTER base-users.sql, tc-s3-177-setup.sql ("Careers Fair" EVT-300, Sam
-- the Safety Officer USR-033) and tc-s3-177e-setup.sql (Main Hall approved).
--
--   SFR-001: CHANGES_REQUESTED by Sam, return to VENUE planning, "Only one exit for 150 people",
--            venue booking flagged, not yet answered; EVT-300 stays PLANNING
--   CHG-004: Cody's planning edit after it (layout notes "Second exit at the rear")

INSERT INTO "SafetyReview" ("id", "eventId", "officerId", "outcome", "reason", "returnStage", "affectedArrangements", "createdAt") VALUES
  ('SFR-001', 'EVT-300', 'USR-033', 'CHANGES_REQUESTED'::"SafetyOutcome", 'Only one exit for 150 people',
     'VENUE'::"SafetyReturnStage", ARRAY['VENUE_BOOKING']::"ConfirmedArrangement"[], '2026-10-01 09:00:00');

UPDATE "EventRequest" SET "layoutNotes" = 'Second exit at the rear' WHERE "id" = 'EVT-300';

INSERT INTO "EventChange" ("id", "eventId", "changedById", "changes", "createdAt") VALUES
  ('CHG-004', 'EVT-300', 'USR-004', '[{"field": "layoutNotes", "previous": null, "next": "Second exit at the rear"}]', '2026-10-02 09:00:00');
