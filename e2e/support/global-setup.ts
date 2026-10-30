import migrateTestDatabase from '../../test/e2e-setup';

/**
 * Before any browser test: create the local test database if it is missing
 * and bring it up to the latest migration. The same step the integration
 * suite runs (test/e2e-setup.ts), so both suites share one schema.
 */
export default function globalSetup(): void {
  migrateTestDatabase();
}
