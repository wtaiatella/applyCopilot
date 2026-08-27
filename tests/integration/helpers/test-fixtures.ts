/**
 * Jest-facing wrapper around the pure test-data marker module. Re-exports
 * `makeTestEmail` and adds `safeCleanup`, a non-swallowing wrapper for
 * `afterEach`/`afterAll` teardown so cleanup failures are logged (and
 * therefore visible in `npm test` output) instead of silently disappearing
 * behind a bare `.catch(() => {})`.
 */

import { prisma } from "@/lib/db/prisma";

export { makeTestEmail } from "@/lib/testing/test-data-marker";

/**
 * Runs `fn`, a test-teardown cleanup step, and logs any rejection via
 * `console.error("[test-cleanup]", label, err)`. Never rethrows — a cleanup
 * failure must not mask or replace the original test's own pass/fail result.
 */
export async function safeCleanup(
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error("[test-cleanup]", label, err);
  }
}

/**
 * T017 rework: `ExperienceBullet.experienceId` uses `onDelete: SetNull` (not `Cascade`) toward
 * `Experience`, so it never hard-deletes when a test's root `User`/`Experience` is torn down —
 * it just orphans (experienceId set to NULL), leaking a row every run. Call this BEFORE deleting
 * the test's `User`/`Experience` rows, while the bullets are still attached, so they get hard-
 * deleted instead of orphaned. Bullets already detached earlier in a test (e.g. via the app's own
 * archive-and-detach DELETE-experience path) must be cleaned up explicitly by id at that point
 * instead — this helper's `profileId` join can no longer find them once `experienceId` is NULL.
 */
export async function deleteProfileExperienceBullets(
  profileId: string,
): Promise<void> {
  await prisma.experienceBullet.deleteMany({
    where: { experience: { profileId } },
  });
}
