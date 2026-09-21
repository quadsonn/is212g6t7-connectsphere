-- Extend the US-06 AccessibilityFeature enum with the agreed fuller list.
-- Additive only: the three original values are kept, so existing
-- EventRequest.accessibilityRequirements rows need no rewrite.

ALTER TYPE "AccessibilityFeature" ADD VALUE 'WHEELCHAIR_ACCESSIBLE_LIFT';
ALTER TYPE "AccessibilityFeature" ADD VALUE 'ACCESSIBLE_PARKING';
ALTER TYPE "AccessibilityFeature" ADD VALUE 'WHEELCHAIR_SEATING';
ALTER TYPE "AccessibilityFeature" ADD VALUE 'NURSING_ROOM';
