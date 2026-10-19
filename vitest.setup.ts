/**
 * Vitest setup file — runs before any test module imports.
 *
 * Provides safe defaults for the env vars that `server/_core/env.ts`
 * insists on at load time, so individual tests don't have to remember
 * to set them. Tests that need to verify env-validation behavior
 * (e.g. `server/_core/env.test.ts`) reset modules and override
 * `process.env` themselves.
 */

// 64-char placeholder. Tests never sign anything that leaves the process,
// so this is fine — but anything ≥ 32 chars satisfies the schema.
process.env.JWT_SECRET ??=
  "test-jwt-secret-not-used-for-real-signing-padded-padded-padded";
process.env.NODE_ENV ??= "test";

// Pass DATABASE_URL explicitly for integration tests against a migrated,
// dedicated MySQL test database. Pure unit tests may omit the connection.

// Storage: tests exercise real uploads (avatar / girlfriend.create),
// so point the local driver at a per-run temp dir.
process.env.STORAGE_DRIVER ??= "local";
process.env.STORAGE_LOCAL_DIR ??= `/tmp/yumei-test-uploads-${process.pid}`;

// Billing (M3): functional tests run in self-host mode so tier gates
// don't entangle unrelated suites. billing.test.ts sets modes per case.
process.env.BILLING_PROVIDER ??= "none";
