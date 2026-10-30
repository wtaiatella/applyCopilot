/**
 * CI Verification Summary & Rolling Release PR orchestration helper.
 *
 * Designed to run directly under Node 22 via `--experimental-strip-types`
 * (using only erasable TypeScript types and Node.js built-in `node:*` modules)
 * as well as inside the Jest unit test suite (`tests/unit/release-pr.test.ts`).
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const RELEASE_BASE_BRANCH = "main";
export const RELEASE_HEAD_BRANCH = "development";
export const RELEASE_PR_TITLE = "chore: release development to main";
export const MAX_RENDERED_COMMITS = 100;

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

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(
    command: string,
    args: readonly string[],
    env?: NodeJS.ProcessEnv,
  ): CommandResult;
}

export interface ReleaseCommit {
  sha: string;
  subject: string;
  author: string;
}

export interface BuildReleasePrBodyInput {
  commits: readonly (ReleaseCommit | string)[];
  totalCommits?: number;
  baseBranch?: string;
  headBranch?: string;
  checkOutcomes?: CheckOutcomes;
}

export type ReleasePrAction = "created" | "updated" | "skipped";

export interface ReleasePrResult {
  action: ReleasePrAction;
  commitsAhead: number;
  prNumber?: number;
  prUrl?: string;
  body?: string;
  /** `true` when `gh pr merge --auto --merge` succeeded (FR-8); `false` on graceful fallback (FR-9). */
  autoMergeEnabled?: boolean;
  /** Non-fatal remediation warning emitted when auto-merge could not be enabled (FR-9). */
  warning?: string;
}

export interface SyncRollingReleasePrOptions {
  runner?: CommandRunner;
  env?: NodeJS.ProcessEnv;
  checkOutcomes?: CheckOutcomes;
  writeSummary?: boolean;
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
 * Default `CommandRunner` implementation backed by `node:child_process.execFileSync`
 * (argument array, no shell interpolation).
 */
export const defaultCommandRunner: CommandRunner = {
  run(
    command: string,
    args: readonly string[],
    env: NodeJS.ProcessEnv = process.env,
  ): CommandResult {
    try {
      const stdout = execFileSync(command, [...args], {
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      return {
        exitCode: 0,
        stdout: typeof stdout === "string" ? stdout : String(stdout),
        stderr: "",
      };
    } catch (error: unknown) {
      const execError = error as {
        status?: number | null;
        stdout?: string | Buffer | null;
        stderr?: string | Buffer | null;
        message?: string;
      };
      const exitCode =
        typeof execError.status === "number" && execError.status !== 0
          ? execError.status
          : 1;
      const stdout = Buffer.isBuffer(execError.stdout)
        ? execError.stdout.toString("utf8")
        : typeof execError.stdout === "string"
          ? execError.stdout
          : "";
      const stderr = Buffer.isBuffer(execError.stderr)
        ? execError.stderr.toString("utf8")
        : typeof execError.stderr === "string"
          ? execError.stderr
          : (execError.message ?? String(error));
      return {
        exitCode,
        stdout,
        stderr,
      };
    }
  },
};

function formatCommitBullet(commit: ReleaseCommit | string): string {
  if (typeof commit === "string") {
    const trimmed = commit.trim();
    return trimmed.startsWith("- ") ? trimmed : `- ${trimmed}`;
  }
  return `- ${commit.sha} ${commit.subject} (${commit.author})`;
}

/**
 * Parses `git log` output into structured `ReleaseCommit` entries or strings.
 * Supports tab-delimited `%h\t%s\t%an` output as well as preformatted `<sha> <subject> (<author>)` lines.
 */
export function parseGitLogOutput(
  rawLog: string,
): Array<ReleaseCommit | string> {
  const lines = rawLog
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line) => {
    const tabParts = line.split("\t");
    if (tabParts.length >= 3) {
      const sha = tabParts[0].trim();
      const author = tabParts[tabParts.length - 1].trim();
      const subject = tabParts.slice(1, -1).join("\t").trim();
      return { sha, subject, author };
    }

    const formattedMatch =
      /^-?\s*([0-9a-fA-F]{7,40})\s+(.+?)\s+\(([^()]+)\)$/.exec(line);
    if (formattedMatch) {
      return {
        sha: formattedMatch[1],
        subject: formattedMatch[2],
        author: formattedMatch[3],
      };
    }

    return line;
  });
}

/**
 * Generates the standardized Markdown body for the rolling Release Pull Request
 * (`development -> main`), including commit count, commit list capped at
 * `MAX_RENDERED_COMMITS = 100` with `...and N more commits` overflow notice,
 * and the CI verification status summary.
 */
export function buildReleasePrBody(input: BuildReleasePrBodyInput): string {
  const baseBranch = input.baseBranch ?? RELEASE_BASE_BRANCH;
  const headBranch = input.headBranch ?? RELEASE_HEAD_BRANCH;
  const renderedSlice = input.commits.slice(0, MAX_RENDERED_COMMITS);
  const totalCommits = Math.max(
    input.totalCommits ?? input.commits.length,
    input.commits.length,
  );
  const overflowCount = Math.max(0, totalCommits - renderedSlice.length);

  const commitLines =
    renderedSlice.length > 0
      ? renderedSlice.map((entry) => formatCommitBullet(entry))
      : ["- *(No commit entries returned)*"];

  if (overflowCount > 0) {
    commitLines.push(`- ...and ${overflowCount} more commits`);
  }

  const verificationOutcomes: CheckOutcomes = input.checkOutcomes ?? {
    migrateOutcome: "success",
    lintOutcome: "success",
    typecheckOutcome: "success",
    testOutcome: "success",
    buildOutcome: "success",
    eventName: "push",
    ref: `refs/heads/${headBranch}`,
  };

  const lines: string[] = [
    `## Rolling Release Pull Request (\`${headBranch}\` → \`${baseBranch}\` | ${headBranch} -> ${baseBranch})`,
    "",
    `- **Source Branch:** \`${headBranch}\``,
    `- **Target Branch:** \`${baseBranch}\``,
    `- **Commits ahead of \`${baseBranch}\`:** ${totalCommits}`,
    "",
    `### Included Commits (${totalCommits})`,
    "",
    ...commitLines,
    "",
    formatVerificationSummary(verificationOutcomes).trimEnd(),
    "",
  ];

  return lines.join("\n");
}

/**
 * Renders the `## Rolling Release Pull Request` Markdown section for `$GITHUB_STEP_SUMMARY`.
 */
export function formatReleasePrSummary(result: ReleasePrResult): string {
  const actionLabel =
    result.action === "skipped"
      ? "skipped (0 commits ahead of main)"
      : result.action;

  const prDisplay =
    result.prNumber !== undefined && result.prUrl
      ? `[#${result.prNumber}](${result.prUrl})`
      : result.prNumber !== undefined
        ? `#${result.prNumber}`
        : result.prUrl
          ? result.prUrl
          : "N/A (not modified)";

  const lines: string[] = [
    "## Rolling Release Pull Request",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Action taken | \`${actionLabel}\` |`,
    `| Pull Request | ${prDisplay} |`,
    `| Commits ahead of \`main\` | ${result.commitsAhead} |`,
  ];

  if (result.autoMergeEnabled !== undefined) {
    lines.push(
      `| Auto-merge | ${
        result.autoMergeEnabled
          ? "✅ Enabled (`--auto --merge`)"
          : "⚠️ Not enabled (manual merge required)"
      } |`,
    );
  }

  lines.push("");

  if (result.warning) {
    lines.push(`> ⚠️ **Warning:** ${result.warning}`, "");
  }

  return lines.join("\n");
}

/**
 * Builds the FR-9 remediation warning shown when auto-merge cannot be enabled.
 */
export function buildAutoMergeWarning(prRef: string, details?: string): string {
  const trimmedDetails = details?.trim() ?? "";
  const reason = trimmedDetails.length > 0 ? ` (${trimmedDetails})` : "";
  return (
    `Auto-merge could not be enabled for PR ${prRef}${reason}. ` +
    `The Release PR was created/updated and must be merged manually. ` +
    `To enable automatic merging, turn on "Allow auto-merge" in Settings → General ` +
    `and configure branch protection (required status checks) for \`${RELEASE_BASE_BRANCH}\` in Settings → Branches.`
  );
}

/**
 * Enables GitHub auto-merge (merge-commit strategy, branch preserved) on the Release PR.
 * Never throws: failures degrade to a `::warning::` annotation and a returned remediation warning (FR-8, FR-9).
 */
function enableAutoMerge(
  runner: CommandRunner,
  prNumber: number | undefined,
  prUrl: string | undefined,
  env: NodeJS.ProcessEnv,
): { autoMergeEnabled: boolean; warning?: string } {
  const prTarget =
    prNumber !== undefined ? String(prNumber) : (prUrl ?? undefined);
  const prRef =
    prNumber !== undefined ? `#${prNumber}` : (prUrl ?? "(unknown)");

  if (!prTarget) {
    const warning = buildAutoMergeWarning(
      prRef,
      "PR number could not be resolved",
    );
    console.log(`::warning::${warning}`);
    return { autoMergeEnabled: false, warning };
  }

  const mergeResult = invokeCommand(
    runner,
    "gh",
    ["pr", "merge", prTarget, "--auto", "--merge"],
    env,
  );

  if (mergeResult.exitCode === 0) {
    console.log(`[release-pr] Auto-merge enabled for Release PR ${prRef}.`);
    return { autoMergeEnabled: true };
  }

  const details =
    mergeResult.stderr.trim() ||
    mergeResult.stdout.trim() ||
    "gh pr merge --auto failed";
  const warning = buildAutoMergeWarning(prRef, details);
  console.log(`::warning::${warning}`);
  return { autoMergeEnabled: false, warning };
}

function invokeCommand(
  runner: CommandRunner,
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): CommandResult {
  console.log(`[release-pr] Running: ${command} ${args.join(" ")}`);
  try {
    return runner.run(command, args, env);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 1,
      stdout: "",
      stderr: message,
    };
  }
}

function parsePrFromStdout(stdout: string): {
  prNumber?: number;
  prUrl?: string;
} {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {};
  }

  const urlMatch = /(https?:\/\/\S+\/pull\/(\d+))/.exec(trimmed);
  if (urlMatch) {
    return {
      prUrl: urlMatch[1],
      prNumber: Number.parseInt(urlMatch[2], 10),
    };
  }

  const numberMatch = /^#?(\d+)$/.exec(trimmed);
  if (numberMatch) {
    return {
      prNumber: Number.parseInt(numberMatch[1], 10),
    };
  }

  return { prUrl: trimmed };
}

function writeErrorStepSummary(
  message: string,
  env: NodeJS.ProcessEnv,
  shouldWriteSummary: boolean,
): void {
  if (!shouldWriteSummary) {
    return;
  }
  const errorSummary = [
    "## Rolling Release Pull Request",
    "",
    `❌ **Error:** ${message}`,
    "",
  ].join("\n");
  writeStepSummary(errorSummary, env);
}

/**
 * Orchestrates idempotent creation or in-place update of the rolling Release Pull Request
 * from `development` to `main`.
 */
export function syncRollingReleasePr(
  options: SyncRollingReleasePrOptions = {},
): ReleasePrResult {
  const runner = options.runner ?? defaultCommandRunner;
  const env = options.env ?? process.env;
  const shouldWriteSummary =
    options.writeSummary ?? Boolean(options.env?.GITHUB_STEP_SUMMARY);

  const finalizeResult = (result: ReleasePrResult): ReleasePrResult => {
    if (shouldWriteSummary) {
      writeStepSummary(formatReleasePrSummary(result), env);
    }
    return result;
  };

  // 1. Fetch latest main and development refs from origin
  const fetchResult = invokeCommand(
    runner,
    "git",
    ["fetch", "origin", RELEASE_BASE_BRANCH, RELEASE_HEAD_BRANCH],
    env,
  );
  if (fetchResult.exitCode !== 0) {
    const details =
      fetchResult.stderr.trim() ||
      fetchResult.stdout.trim() ||
      "git fetch failed";
    const errorMessage = `[release-pr] git fetch origin ${RELEASE_BASE_BRANCH} ${RELEASE_HEAD_BRANCH} failed: ${details}`;
    console.error(`[release-pr] Failed to fetch origin branches: ${details}`);
    writeErrorStepSummary(errorMessage, env, shouldWriteSummary);
    throw new Error(errorMessage);
  }

  // 2. Compute commit divergence count: origin/main..origin/development
  const revListRange = `origin/${RELEASE_BASE_BRANCH}..origin/${RELEASE_HEAD_BRANCH}`;
  const revListResult = invokeCommand(
    runner,
    "git",
    ["rev-list", "--count", revListRange],
    env,
  );
  if (revListResult.exitCode !== 0) {
    const details =
      revListResult.stderr.trim() ||
      revListResult.stdout.trim() ||
      "git rev-list failed";
    const errorMessage = `[release-pr] git rev-list --count ${revListRange} failed: ${details}`;
    console.error(`[release-pr] Failed to compute commit count: ${details}`);
    writeErrorStepSummary(errorMessage, env, shouldWriteSummary);
    throw new Error(errorMessage);
  }

  const commitsAhead = Number.parseInt(revListResult.stdout.trim(), 10);
  if (Number.isNaN(commitsAhead) || commitsAhead < 0) {
    const errorMessage = `[release-pr] Invalid commit count output from git rev-list: "${revListResult.stdout.trim()}"`;
    writeErrorStepSummary(errorMessage, env, shouldWriteSummary);
    throw new Error(errorMessage);
  }

  if (commitsAhead === 0) {
    console.log(
      `[release-pr] ${RELEASE_HEAD_BRANCH} is 0 commits ahead of ${RELEASE_BASE_BRANCH}; skipping Release PR creation/update.`,
    );
    return finalizeResult({
      action: "skipped",
      commitsAhead: 0,
    });
  }

  // Gather commit summaries between origin/main and origin/development
  const logResult = invokeCommand(
    runner,
    "git",
    ["log", "--format=%h%x09%s%x09%an", revListRange],
    env,
  );
  if (logResult.exitCode !== 0) {
    const details =
      logResult.stderr.trim() || logResult.stdout.trim() || "git log failed";
    const errorMessage = `[release-pr] git log ${revListRange} failed: ${details}`;
    console.error(`[release-pr] Failed to read commit log: ${details}`);
    writeErrorStepSummary(errorMessage, env, shouldWriteSummary);
    throw new Error(errorMessage);
  }

  const commits = parseGitLogOutput(logResult.stdout);

  // 3. Query open PRs from development -> main
  const prListResult = invokeCommand(
    runner,
    "gh",
    [
      "pr",
      "list",
      "--base",
      RELEASE_BASE_BRANCH,
      "--head",
      RELEASE_HEAD_BRANCH,
      "--state",
      "open",
      "--json",
      "number,url",
    ],
    env,
  );
  if (prListResult.exitCode !== 0) {
    const details =
      prListResult.stderr.trim() ||
      prListResult.stdout.trim() ||
      "gh pr list failed";
    const errorMessage = `[release-pr] gh pr list failed: ${details}`;
    console.error(`[release-pr] Failed to query open Release PRs: ${details}`);
    writeErrorStepSummary(errorMessage, env, shouldWriteSummary);
    throw new Error(errorMessage);
  }

  let openPrs: Array<{ number: number; url?: string }> = [];
  try {
    const parsed = JSON.parse(prListResult.stdout.trim() || "[]") as unknown;
    if (Array.isArray(parsed)) {
      openPrs = parsed as Array<{ number: number; url?: string }>;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const errorMessage = `[release-pr] Failed to parse gh pr list JSON output: ${message}`;
    writeErrorStepSummary(errorMessage, env, shouldWriteSummary);
    throw new Error(errorMessage);
  }

  const checkOutcomes = options.checkOutcomes ?? {
    ...readCheckOutcomesFromEnv(env),
    buildOutcome: env.BUILD_OUTCOME ?? "success",
    eventName: env.GITHUB_EVENT_NAME ?? "push",
    ref: env.GITHUB_REF ?? `refs/heads/${RELEASE_HEAD_BRANCH}`,
  };

  const body = buildReleasePrBody({
    commits,
    totalCommits: commitsAhead,
    baseBranch: RELEASE_BASE_BRANCH,
    headBranch: RELEASE_HEAD_BRANCH,
    checkOutcomes,
  });

  // 4. Write generated PR body to a temporary file and create or update the Release PR
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "release-pr-body-"));
  const bodyFilePath = path.join(tempDir, "release-pr-body.md");

  try {
    fs.writeFileSync(bodyFilePath, body, "utf8");

    if (openPrs.length === 0) {
      const createResult = invokeCommand(
        runner,
        "gh",
        [
          "pr",
          "create",
          "--base",
          RELEASE_BASE_BRANCH,
          "--head",
          RELEASE_HEAD_BRANCH,
          "--title",
          RELEASE_PR_TITLE,
          "--body-file",
          bodyFilePath,
        ],
        env,
      );
      if (createResult.exitCode !== 0) {
        const details =
          createResult.stderr.trim() ||
          createResult.stdout.trim() ||
          "gh pr create failed";
        const errorMessage = `[release-pr] gh pr create failed: ${details}`;
        console.error(
          `[release-pr] Failed to create Release PR: ${details}. Verify Settings -> Actions -> General -> Workflow permissions ("Allow GitHub Actions to create and approve pull requests").`,
        );
        writeErrorStepSummary(errorMessage, env, shouldWriteSummary);
        throw new Error(errorMessage);
      }

      const { prNumber, prUrl } = parsePrFromStdout(createResult.stdout);
      console.log(
        `[release-pr] Created Release PR ${prNumber ? `#${prNumber}` : (prUrl ?? "")}`.trim(),
      );

      const autoMerge = enableAutoMerge(runner, prNumber, prUrl, env);

      return finalizeResult({
        action: "created",
        commitsAhead,
        prNumber,
        prUrl,
        body,
        ...autoMerge,
      });
    }

    const existingPr = openPrs[0];
    const editResult = invokeCommand(
      runner,
      "gh",
      [
        "pr",
        "edit",
        String(existingPr.number),
        "--title",
        RELEASE_PR_TITLE,
        "--body-file",
        bodyFilePath,
      ],
      env,
    );
    if (editResult.exitCode !== 0) {
      const details =
        editResult.stderr.trim() ||
        editResult.stdout.trim() ||
        "gh pr edit failed";
      const errorMessage = `[release-pr] gh pr edit ${existingPr.number} failed: ${details}`;
      console.error(
        `[release-pr] Failed to update Release PR #${existingPr.number}: ${details}`,
      );
      writeErrorStepSummary(errorMessage, env, shouldWriteSummary);
      throw new Error(errorMessage);
    }

    console.log(
      `[release-pr] Updated existing Release PR #${existingPr.number} in-place.`,
    );

    const autoMerge = enableAutoMerge(
      runner,
      existingPr.number,
      existingPr.url,
      env,
    );

    return finalizeResult({
      action: "updated",
      commitsAhead,
      prNumber: existingPr.number,
      prUrl: existingPr.url,
      body,
      ...autoMerge,
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * CLI entrypoint for `node --experimental-strip-types src/lib/ci/release-pr.ts <subcommand>`.
 */
export function runCli(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  runner?: CommandRunner,
): number {
  const subcommand = argv[0];

  if (subcommand === "summary") {
    const outcomes = readCheckOutcomesFromEnv(env);
    const summaryMarkdown = formatVerificationSummary(outcomes);
    writeStepSummary(summaryMarkdown, env);
    return 0;
  }

  if (subcommand === "release") {
    try {
      syncRollingReleasePr({ runner, env, writeSummary: true });
      return 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[release-pr] Release PR sync failed: ${message}`);
      return 1;
    }
  }

  console.error(
    `[release-pr] Unknown or missing subcommand: "${subcommand ?? ""}". Expected "summary" or "release".`,
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
