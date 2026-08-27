/**
 * Test-data marker convention for the integration test suite.
 *
 * Every integration test file already creates its fixture users with an
 * `@example.com` email (e.g. `application-apply-test-${Date.now()}@example.com`).
 * `example.com` is an IANA/RFC 2606 reserved documentation domain, so it can
 * never collide with a real user's email — this makes it a safe, zero-migration
 * marker for "this row was created by a test" without adding a schema column.
 *
 * This module is intentionally pure and framework-agnostic (no Jest import) so
 * it can be imported both by Jest integration tests
 * (`tests/integration/helpers/test-fixtures.ts`) and by the standalone sweep
 * script (`src/scripts/sweep-test-data.ts`), which runs outside the Jest
 * runner via plain `tsx`. `src/` code must never depend on `tests/` code.
 *
 * Phase 5 audit (T013): re-grepped every `tests/integration/**\/*.test.ts` file
 * (36 files, incl. `scraper/`) for `@example.com` fixture-email adoption.
 * 100% consistent — every file that creates a fixture-user row uses the
 * `@example.com` marker domain. Five files (`classification-worker.test.ts`,
 * `middleware-matcher.test.ts`, `vector-query.test.ts`,
 * `scraper/engine.test.ts`, `scraper/queue.test.ts`) create no user/email
 * fixtures at all, so there is nothing to mark. Three files
 * (`backfill-skill-vocabulary.test.ts`, `llm-config.test.ts`,
 * `skill-threshold.test.ts`) reference a real address
 * (`wtaiatella@gmail.com`) inside a `jest.mock("@/lib/auth/auth", ...)`
 * mocked session object — this is an in-memory auth-mock literal, never
 * persisted via Prisma, so it is not test-fixture data and is out of scope
 * for the marker/sweep convention. No exceptions found.
 */

import type { PrismaClient } from "@prisma/client";

/** Reserved (RFC 2606) documentation domain used to mark test-created data. */
export const TEST_EMAIL_DOMAIN = "example.com";

/** True if `email` belongs to the test-data marker domain. */
export function isTestEmail(email: string): boolean {
  return email.endsWith(`@${TEST_EMAIL_DOMAIN}`);
}

/**
 * Builds a unique, marker-domain email for a test fixture. Includes a random
 * suffix (in addition to `Date.now()`) so two synchronous calls within the
 * same millisecond still produce distinct emails.
 */
export function makeTestEmail(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}@${TEST_EMAIL_DOMAIN}`;
}

export interface SweepResult {
  matchedUserCount: number;
  deletedUserCount: number;
}

/**
 * Finds (and, with `execute: true`, deletes) all `User` rows whose email
 * belongs to the test-data marker domain. Deleting a matched `User` cascades
 * (per `prisma/schema.prisma`'s `onDelete: Cascade`) through `UserProfile`
 * and its children, `PasswordResetToken`, `AIUsageLog`, and `Session` — no
 * separate delete statements are needed for those tables. `SystemConfig` and
 * the scraper-suite tables (`ScrapeTask`/`PortalSearchUrl`/`JobListing`) are
 * never targeted by this sweep — see spectech's Technical Decisions.
 */
export async function sweepTestData(
  prisma: PrismaClient,
  opts: { execute: boolean },
): Promise<SweepResult> {
  // Fail closed: an explicit `=== true` check (not just TypeScript's boolean
  // type) so a stray truthy value can never slip past this guard at runtime.
  // Environment guard: refuse to run the destructive delete against a
  // production database. Checked before any query runs — nothing about the
  // `PrismaClient` instance itself proves which DB it's bound to, so
  // `NODE_ENV` is the last line of defense before a marker-scoped
  // `deleteMany()`.
  if (opts.execute === true && process.env.NODE_ENV === "production") {
    throw new Error(
      "sweepTestData: refusing to execute destructive delete — NODE_ENV is 'production'",
    );
  }

  const matched = await prisma.user.findMany({
    where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } },
    select: { id: true },
  });

  if (opts.execute !== true) {
    return { matchedUserCount: matched.length, deletedUserCount: 0 };
  }

  const { count } = await prisma.user.deleteMany({
    where: { id: { in: matched.map((u) => u.id) } },
  });

  return { matchedUserCount: matched.length, deletedUserCount: count };
}
