-- tc-s3-64b-setup.sql: Main Hall itself would fit the Showcase.
--
-- Pre-condition for TC-S3-64 (Story 41 AC-2: the requested venue is never
-- proposed). Load AFTER tc-s3-63-setup.sql.
--
--   VEN-041   mainHall gains step-free access and a theatre layout

UPDATE "Venue" SET "accessibilityFeatures" = ARRAY['STEP_FREE_ACCESS']::"AccessibilityFeature"[],
  "supportedLayouts" = ARRAY['THEATRE']::"RoomLayout"[] WHERE "id" = 'VEN-041';
