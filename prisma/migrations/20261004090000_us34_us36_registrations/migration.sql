-- US-34/US-36: registration window and withdrawal cutoff, set per event.
ALTER TABLE "EventRequest"
  ADD COLUMN "registrationOpensAt" TIMESTAMP(3),
  ADD COLUMN "registrationClosesAt" TIMESTAMP(3),
  ADD COLUMN "withdrawalCutoffAt" TIMESTAMP(3);

-- US-34 AC-2: the registration form's fields. The temporary default lets the
-- NOT NULL column be added to any existing rows; it is dropped straight away
-- so every new registration must supply a phone number.
ALTER TABLE "Registration"
  ADD COLUMN "phone" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "dietaryRequirements" TEXT,
  ADD COLUMN "accessibilityNeeds" TEXT,
  ADD COLUMN "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "Registration" ALTER COLUMN "phone" DROP DEFAULT;
