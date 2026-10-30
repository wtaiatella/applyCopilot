/**
 * CI Verification Summary & Rolling Release PR orchestration helper.
 *
 * Designed to run directly under Node 22 via `--experimental-strip-types`
 * (using only erasable TypeScript types and Node.js built-in `node:*` modules)
 * as well as inside the Jest unit test suite (`tests/unit/release-pr.test.ts`).
 */

import * as fs from "node:fs";
import * as path from "node:path";

export type StepOutcome =
  | "success"
  | "failure"
  | "skipped"
  | "cancelled"
  | string;

export interface CheckOutcomes {
  migrateOutcome?: StepOutcome;
  lintOutcome?: StepOutcome;
  typecheckOutcome?: StepOutcome;
  testOutcome?: StepOutcome;
  buildOutcome: StepOutcome;
  eventName?: string;
  ref?: string;
}

function formatAdvisoryStatus(outcome: StepOutcome | undefined): string {
  return outcome === "success"
    ? "✅ Passed"
    : "⚠️ Advisory Warning (non-blocking)";
}

function formatBuildStatus(outcome: StepOutcome): string {
  return outcome === "success"
    ? "✅ Passed (Strict Gate)"
    : "❌ Failed (Strict Gate — Blocking)";
}

function formatReleasePrReadiness(outcomes: CheckOutcomes): string {
  if (outcomes.buildOutcome !== "success") {
    return "🚫 Blocked (Production build failed)";
  }

  const isDevelopmentPush =
    outcomes.eventName === "push" &&
    (outcomes.ref === "refs/heads/development" ||
      outcomes.ref === "development");

  if (!isDevelopmentPush) {
    return "⏭️ Skipped (Not a push to development)";
  }

  return "⏳ Pending release-pr job...";
}

/**
 * Renders the `## CI Verification Summary` Markdown table reporting the
 * individual outcomes of advisory quality checks, the strict production build
 * gate, and the rolling Release PR gate status.
 */
export function formatVerificationSummary(outcomes: CheckOutcomes): string {
  const migrateOutcome = outcomes.migrateOutcome ?? "success";
  const lintOutcome = outcomes.lintOutcome ?? "success";
  const typecheckOutcome = outcomes.typecheckOutcome ?? "success";
  const testOutcome = outcomes.testOutcome ?? "success";

  const rows: Array<readonly [string, string]> = [
    [
      "Database Migrations (`prisma migrate deploy`)",
      formatAdvisoryStatus(migrateOutcome),
    ],
    ["Code Linting (`npm run lint`)", formatAdvisoryStatus(lintOutcome)],
    [
      "Static Type Check (`npm run typecheck`)",
      formatAdvisoryStatus(typecheckOutcome),
    ],
    [
      "Automated Tests (`npm run test:coverage`)",
      formatAdvisoryStatus(testOutcome),
    ],
    [
      "Production Build (`npm run build`)",
      formatBuildStatus(outcomes.buildOutcome),
    ],
    [
      "Rolling Release PR (`development -> main`)",
      formatReleasePrReadiness(outcomes),
    ],
  ];

  const lines: string[] = [
    "## CI Verification Summary",
    "",
    "| Check | Status |",
    "| --- | --- |",
    ...rows.map(([check, status]) => `| ${check} | ${status} |`),
    "",
  ];

  return lines.join("\n");
}

/**
 * Reads step outcomes from environment variables populated by `.github/workflows/ci.yml`.
 */
export function readCheckOutcomesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CheckOutcomes {
  return {
    migrateOutcome: env.MIGRATE_OUTCOME ?? "success",
    lintOutcome: env.LINT_OUTCOME ?? "success",
    typecheckOutcome: env.TYPECHECK_OUTCOME ?? "success",
    testOutcome: env.TEST_OUTCOME ?? "success",
    buildOutcome: env.BUILD_OUTCOME ?? "failure",
    eventName: env.GITHUB_EVENT_NAME ?? "",
    ref: env.GITHUB_REF ?? "",
  };
}

/**
 * Appends a Markdown section to `$GITHUB_STEP_SUMMARY` when set and echoes it to stdout.
 */
export function writeStepSummary(
  markdown: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const summaryPath = env.GITHUB_STEP_SUMMARY;
  if (summaryPath && summaryPath.trim().length > 0) {
    fs.appendFileSync(summaryPath, `${markdown}\n`, "utf8");
  }
  process.stdout.write(`${markdown}\n`);
}

/**
 * CLI entrypoint for `node --experimental-strip-types src/lib/ci/release-pr.ts <subcommand>`.
 */
export function runCli(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): number {
  const subcommand = argv[0];

  if (subcommand === "summary") {
    const outcomes = readCheckOutcomesFromEnv(env);
    const summaryMarkdown = formatVerificationSummary(outcomes);
    writeStepSummary(summaryMarkdown, env);
    return 0;
  }

  console.error(
    `[release-pr] Unknown or missing subcommand: "${subcommand ?? ""}". Expected "summary".`,
  );
  return 1;
}

const isMainModule =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  path.basename(process.argv[1]) === "release-pr.ts";

if (isMainModule) {
  const exitCode = runCli();
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
