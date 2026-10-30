import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  MAX_RENDERED_COMMITS,
  RELEASE_BASE_BRANCH,
  RELEASE_HEAD_BRANCH,
  RELEASE_PR_TITLE,
  buildAutoMergeWarning,
  buildReleasePrBody,
  formatReleasePrSummary,
  formatVerificationSummary,
  parseGitLogOutput,
  readCheckOutcomesFromEnv,
  runCli,
  syncRollingReleasePr,
  writeStepSummary,
  type CheckOutcomes,
  type CommandResult,
  type CommandRunner,
  type ReleaseCommit,
} from "@/lib/ci/release-pr";

describe("release-pr — Phase 1 (US1: Strict Build Gate & Advisory Quality Visibility)", () => {
  describe("formatVerificationSummary()", () => {
    it("renders all checks as passed and pending release-pr when build succeeds on a development push", () => {
      const outcomes: CheckOutcomes = {
        migrateOutcome: "success",
        lintOutcome: "success",
        typecheckOutcome: "success",
        testOutcome: "success",
        buildOutcome: "success",
        eventName: "push",
        ref: "refs/heads/development",
      };

      const summary = formatVerificationSummary(outcomes);

      expect(summary).toContain("## CI Verification Summary");
      expect(summary).toContain(
        "| Database Migrations (`prisma migrate deploy`) | ✅ Passed |",
      );
      expect(summary).toContain(
        "| Code Linting (`npm run lint`) | ✅ Passed |",
      );
      expect(summary).toContain(
        "| Static Type Check (`npm run typecheck`) | ✅ Passed |",
      );
      expect(summary).toContain(
        "| Automated Tests (`npm run test:coverage`) | ✅ Passed |",
      );
      expect(summary).toContain(
        "| Production Build (`npm run build`) | ✅ Passed (Strict Gate) |",
      );
      expect(summary).toContain(
        "| Rolling Release PR (`development -> main`) | ⏳ Pending release-pr job... |",
      );
    });

    it("renders advisory warnings for failed migrate/lint/typecheck/test while build passes without blocking Release PR (AC.1, FR-2, FR-3)", () => {
      const outcomes: CheckOutcomes = {
        migrateOutcome: "failure",
        lintOutcome: "failure",
        typecheckOutcome: "failure",
        testOutcome: "failure",
        buildOutcome: "success",
        eventName: "push",
        ref: "refs/heads/development",
      };

      const summary = formatVerificationSummary(outcomes);

      expect(summary).toContain(
        "| Database Migrations (`prisma migrate deploy`) | ⚠️ Advisory Warning (non-blocking) |",
      );
      expect(summary).toContain(
        "| Code Linting (`npm run lint`) | ⚠️ Advisory Warning (non-blocking) |",
      );
      expect(summary).toContain(
        "| Static Type Check (`npm run typecheck`) | ⚠️ Advisory Warning (non-blocking) |",
      );
      expect(summary).toContain(
        "| Automated Tests (`npm run test:coverage`) | ⚠️ Advisory Warning (non-blocking) |",
      );
      expect(summary).toContain(
        "| Production Build (`npm run build`) | ✅ Passed (Strict Gate) |",
      );
      expect(summary).toContain(
        "| Rolling Release PR (`development -> main`) | ⏳ Pending release-pr job... |",
      );
    });

    it("renders strict blocking failure and blocks Release PR when production build fails (AC.2, FR-4)", () => {
      const outcomes: CheckOutcomes = {
        migrateOutcome: "success",
        lintOutcome: "failure",
        typecheckOutcome: "failure",
        testOutcome: "success",
        buildOutcome: "failure",
        eventName: "push",
        ref: "refs/heads/development",
      };

      const summary = formatVerificationSummary(outcomes);

      expect(summary).toContain(
        "| Production Build (`npm run build`) | ❌ Failed (Strict Gate — Blocking) |",
      );
      expect(summary).toContain(
        "| Rolling Release PR (`development -> main`) | 🚫 Blocked (Production build failed) |",
      );
    });

    it("marks Rolling Release PR as skipped when event is pull_request or push to main", () => {
      const prSummary = formatVerificationSummary({
        buildOutcome: "success",
        eventName: "pull_request",
        ref: "refs/pull/12/merge",
      });

      expect(prSummary).toContain(
        "| Rolling Release PR (`development -> main`) | ⏭️ Skipped (Not a push to development) |",
      );

      const mainPushSummary = formatVerificationSummary({
        buildOutcome: "success",
        eventName: "push",
        ref: "refs/heads/main",
      });

      expect(mainPushSummary).toContain(
        "| Rolling Release PR (`development -> main`) | ⏭️ Skipped (Not a push to development) |",
      );
    });
  });

  describe("readCheckOutcomesFromEnv(), writeStepSummary(), and runCli()", () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "release-pr-test-"));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("reads check outcomes from environment variables with safe defaults", () => {
      const outcomes = readCheckOutcomesFromEnv({
        NODE_ENV: "test",
        MIGRATE_OUTCOME: "success",
        LINT_OUTCOME: "failure",
        TYPECHECK_OUTCOME: "failure",
        TEST_OUTCOME: "success",
        BUILD_OUTCOME: "success",
        GITHUB_EVENT_NAME: "push",
        GITHUB_REF: "refs/heads/development",
      });

      expect(outcomes).toEqual({
        migrateOutcome: "success",
        lintOutcome: "failure",
        typecheckOutcome: "failure",
        testOutcome: "success",
        buildOutcome: "success",
        eventName: "push",
        ref: "refs/heads/development",
      });
    });

    it("appends summary markdown to GITHUB_STEP_SUMMARY via runCli(['summary'])", () => {
      const summaryFile = path.join(tempDir, "step-summary.md");
      const writeSpy = jest
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);

      try {
        const exitCode = runCli(["summary"], {
          NODE_ENV: "test",
          GITHUB_STEP_SUMMARY: summaryFile,
          MIGRATE_OUTCOME: "success",
          LINT_OUTCOME: "failure",
          TYPECHECK_OUTCOME: "failure",
          TEST_OUTCOME: "failure",
          BUILD_OUTCOME: "success",
          GITHUB_EVENT_NAME: "push",
          GITHUB_REF: "refs/heads/development",
        });

        expect(exitCode).toBe(0);
        const written = fs.readFileSync(summaryFile, "utf8");
        expect(written).toContain("## CI Verification Summary");
        expect(written).toContain(
          "| Code Linting (`npm run lint`) | ⚠️ Advisory Warning (non-blocking) |",
        );
        expect(written).toContain(
          "| Production Build (`npm run build`) | ✅ Passed (Strict Gate) |",
        );
      } finally {
        writeSpy.mockRestore();
      }
    });

    it("writes to stdout even when GITHUB_STEP_SUMMARY is not set and returns 1 on unknown subcommand", () => {
      const writeSpy = jest
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      try {
        writeStepSummary("# Summary Test", { NODE_ENV: "test" });
        expect(writeSpy).toHaveBeenCalledWith("# Summary Test\n");

        const exitCode = runCli(["unknown-cmd"], { NODE_ENV: "test" });
        expect(exitCode).toBe(1);
      } finally {
        writeSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });
  });

  describe("Package & Workflow Contract Checks (Phase 1)", () => {
    const repoRoot = path.resolve(__dirname, "../..");
    const packageJsonPath = path.join(repoRoot, "package.json");
    const ciWorkflowPath = path.join(repoRoot, ".github/workflows/ci.yml");

    it("exposes standalone typecheck script ('tsc --noEmit') in package.json without removing existing scripts (T001, FR-2)", () => {
      const rawPackageJson = fs.readFileSync(packageJsonPath, "utf8");
      const packageJson = JSON.parse(rawPackageJson) as {
        scripts?: Record<string, string>;
      };

      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.scripts?.typecheck).toBe("tsc --noEmit");
      expect(packageJson.scripts?.build).toBe("next build");
      expect(packageJson.scripts?.lint).toBe("eslint");
      expect(packageJson.scripts?.["test:coverage"]).toBe("jest --coverage");
    });

    it("configures .github/workflows/ci.yml with development trigger, least-privilege read permission, step-level advisory checks, and blocking build gate (T003, FR-1..FR-4, AC.1, AC.2)", () => {
      const workflowYaml = fs.readFileSync(ciWorkflowPath, "utf8");

      // FR-1: Trigger on push to main and development, plus pull_request
      expect(workflowYaml).toMatch(/pull_request:/);
      expect(workflowYaml).toMatch(/branches:\s*\[main,\s*development\]/);

      // Security: Top-level read-only contents permission
      expect(workflowYaml).toMatch(/permissions:\s*\n\s*contents:\s*read/);

      // Verify job exists and does not set job-level continue-on-error: true
      expect(workflowYaml).toMatch(/jobs:\s*\n\s*verify:/);

      // Prisma client generation before checks and build
      expect(workflowYaml).toContain("npx prisma generate");

      // FR-2 & AC.1: Step-level continue-on-error: true on advisory steps (migrate, lint, typecheck, test)
      expect(workflowYaml).toMatch(
        /id:\s*migrate[\s\S]*?continue-on-error:\s*true[\s\S]*?run:\s*npx prisma migrate deploy/,
      );
      expect(workflowYaml).toMatch(
        /id:\s*lint[\s\S]*?continue-on-error:\s*true[\s\S]*?run:\s*npm run lint/,
      );
      expect(workflowYaml).toMatch(
        /id:\s*typecheck[\s\S]*?continue-on-error:\s*true[\s\S]*?run:\s*npm run typecheck/,
      );
      expect(workflowYaml).toMatch(
        /id:\s*test[\s\S]*?continue-on-error:\s*true[\s\S]*?run:\s*npm run test:coverage/,
      );

      // FR-4 & AC.2: Blocking production build gate
      expect(workflowYaml).toMatch(
        /id:\s*build[\s\S]*?continue-on-error:\s*false[\s\S]*?run:\s*NODE_ENV=production npm run build/,
      );

      // FR-3: Step summary invocation using steps.<id>.outcome
      expect(workflowYaml).toContain("if: always()");
      expect(workflowYaml).toContain(
        "node --experimental-strip-types src/lib/ci/release-pr.ts summary",
      );
      expect(workflowYaml).toContain(
        "MIGRATE_OUTCOME: ${{ steps.migrate.outcome }}",
      );
      expect(workflowYaml).toContain("LINT_OUTCOME: ${{ steps.lint.outcome }}");
      expect(workflowYaml).toContain(
        "TYPECHECK_OUTCOME: ${{ steps.typecheck.outcome }}",
      );
      expect(workflowYaml).toContain("TEST_OUTCOME: ${{ steps.test.outcome }}");
      expect(workflowYaml).toContain(
        "BUILD_OUTCOME: ${{ steps.build.outcome }}",
      );
    });
  });
});

interface RecordedCall {
  command: string;
  args: readonly string[];
  bodyFileContent?: string;
  bodyFilePath?: string;
}

function createStubRunner(
  handler: (
    command: string,
    args: readonly string[],
    callIndex: number,
  ) => CommandResult,
): { runner: CommandRunner; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const runner: CommandRunner = {
    run(command: string, args: readonly string[]): CommandResult {
      let bodyFileContent: string | undefined;
      let bodyFilePath: string | undefined;
      const bodyFileIndex = args.indexOf("--body-file");
      if (bodyFileIndex !== -1 && bodyFileIndex + 1 < args.length) {
        bodyFilePath = args[bodyFileIndex + 1];
        if (fs.existsSync(bodyFilePath)) {
          bodyFileContent = fs.readFileSync(bodyFilePath, "utf8");
        }
      }

      const callIndex = calls.length;
      calls.push({ command, args: [...args], bodyFileContent, bodyFilePath });
      return handler(command, args, callIndex);
    },
  };

  return { runner, calls };
}

describe("release-pr — Phase 2 (US2: Automated Creation & Rolling Update of Release PR)", () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe("parseGitLogOutput() and buildReleasePrBody()", () => {
    it("parses tab-delimited and preformatted git log lines into ReleaseCommit entries", () => {
      const rawLog = [
        "a1b2c3d\tfeat: add rolling release pr\tAlice Dev",
        "e4f5a6b fix: handle zero commits (Bob Maintainer)",
      ].join("\n");

      const parsed = parseGitLogOutput(rawLog);

      expect(parsed).toEqual([
        {
          sha: "a1b2c3d",
          subject: "feat: add rolling release pr",
          author: "Alice Dev",
        },
        {
          sha: "e4f5a6b",
          subject: "fix: handle zero commits",
          author: "Bob Maintainer",
        },
      ]);
    });

    it("includes target/source branches (development -> main), total commit count, formatted commit list, and embedded verification summary table (T005)", () => {
      const commits: ReleaseCommit[] = [
        {
          sha: "111aaaa",
          subject: "feat(ci): add verify summary",
          author: "Jane Doe",
        },
        {
          sha: "222bbbb",
          subject: "fix(api): handle timeout",
          author: "John Smith",
        },
      ];

      const body = buildReleasePrBody({
        commits,
        totalCommits: 2,
        checkOutcomes: {
          migrateOutcome: "success",
          lintOutcome: "failure",
          typecheckOutcome: "failure",
          testOutcome: "success",
          buildOutcome: "success",
          eventName: "push",
          ref: "refs/heads/development",
        },
      });

      expect(body).toContain(
        `## Rolling Release Pull Request (\`${RELEASE_HEAD_BRANCH}\` → \`${RELEASE_BASE_BRANCH}\` | ${RELEASE_HEAD_BRANCH} -> ${RELEASE_BASE_BRANCH})`,
      );
      expect(body).toContain("- **Source Branch:** `development`");
      expect(body).toContain("- **Target Branch:** `main`");
      expect(body).toContain("- **Commits ahead of `main`:** 2");
      expect(body).toContain("### Included Commits (2)");
      expect(body).toContain(
        "- 111aaaa feat(ci): add verify summary (Jane Doe)",
      );
      expect(body).toContain("- 222bbbb fix(api): handle timeout (John Smith)");
      expect(body).toContain("## CI Verification Summary");
      expect(body).toContain(
        "| Code Linting (`npm run lint`) | ⚠️ Advisory Warning (non-blocking) |",
      );
      expect(body).toContain(
        "| Production Build (`npm run build`) | ✅ Passed (Strict Gate) |",
      );
      expect(body).not.toContain("more commits");
    });

    it("truncates commit lists exceeding MAX_RENDERED_COMMITS (100) with '- ...and N more commits' (T005, NFR Performance & Scalability)", () => {
      const commits: ReleaseCommit[] = Array.from({ length: 125 }, (_, i) => ({
        sha: `sha${String(i + 1).padStart(4, "0")}`,
        subject: `feat: commit number ${i + 1}`,
        author: "Dev Bot",
      }));

      expect(MAX_RENDERED_COMMITS).toBe(100);
      const body = buildReleasePrBody({ commits });

      expect(body).toContain("- **Commits ahead of `main`:** 125");
      expect(body).toContain("### Included Commits (125)");
      expect(body).toContain("- sha0001 feat: commit number 1 (Dev Bot)");
      expect(body).toContain("- sha0100 feat: commit number 100 (Dev Bot)");
      expect(body).not.toContain("sha0101");
      expect(body).toContain("- ...and 25 more commits");
    });
  });

  describe("syncRollingReleasePr()", () => {
    it("returns { action: 'skipped', commitsAhead: 0 } and does not invoke gh pr list, gh pr create, or gh pr edit when git rev-list returns '0\\n' (AC.4, FR-5, T005)", () => {
      const { runner, calls } = createStubRunner((command, args) => {
        if (command === "git" && args[0] === "fetch") {
          return { exitCode: 0, stdout: "", stderr: "" };
        }
        if (command === "git" && args[0] === "rev-list") {
          return { exitCode: 0, stdout: "0\n", stderr: "" };
        }
        throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
      });

      const result = syncRollingReleasePr({ runner, writeSummary: false });

      expect(result).toEqual({
        action: "skipped",
        commitsAhead: 0,
      });
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({
        command: "git",
        args: ["fetch", "origin", "main", "development"],
      });
      expect(calls[1]).toMatchObject({
        command: "git",
        args: ["rev-list", "--count", "origin/main..origin/development"],
      });
      expect(calls.some((c) => c.command === "gh")).toBe(false);
    });

    it("invokes gh pr create --base main --head development --title 'chore: release development to main' --body-file <tmpFile> when commits > 0 and gh pr list returns '[]' (AC.3, FR-6, T005)", () => {
      const { runner, calls } = createStubRunner((command, args) => {
        if (command === "git" && args[0] === "fetch") {
          return { exitCode: 0, stdout: "", stderr: "" };
        }
        if (command === "git" && args[0] === "rev-list") {
          return { exitCode: 0, stdout: "2\n", stderr: "" };
        }
        if (command === "git" && args[0] === "log") {
          return {
            exitCode: 0,
            stdout:
              "abc1234\tfeat: first change\tAlice\ndef5678\tfix: second change\tBob\n",
            stderr: "",
          };
        }
        if (command === "gh" && args[0] === "pr" && args[1] === "list") {
          return { exitCode: 0, stdout: "[]\n", stderr: "" };
        }
        if (command === "gh" && args[0] === "pr" && args[1] === "create") {
          return {
            exitCode: 0,
            stdout: "https://github.com/wtaiatella/applyCopilot/pull/19\n",
            stderr: "",
          };
        }
        if (command === "gh" && args[0] === "pr" && args[1] === "merge") {
          return { exitCode: 0, stdout: "", stderr: "" };
        }
        throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
      });

      const result = syncRollingReleasePr({ runner, writeSummary: false });

      expect(result.action).toBe("created");
      expect(result.commitsAhead).toBe(2);
      expect(result.prNumber).toBe(19);
      expect(result.prUrl).toBe(
        "https://github.com/wtaiatella/applyCopilot/pull/19",
      );

      const createCall = calls.find(
        (c) =>
          c.command === "gh" && c.args[0] === "pr" && c.args[1] === "create",
      );
      expect(createCall).toBeDefined();
      expect(createCall?.args.slice(0, 9)).toEqual([
        "pr",
        "create",
        "--base",
        "main",
        "--head",
        "development",
        "--title",
        RELEASE_PR_TITLE,
        "--body-file",
      ]);
      expect(createCall?.bodyFilePath).toBeDefined();
      expect(createCall?.bodyFileContent).toContain(
        "- abc1234 feat: first change (Alice)",
      );
      expect(createCall?.bodyFileContent).toContain(
        "- def5678 fix: second change (Bob)",
      );
      // Temporary file is cleaned up in finally
      expect(fs.existsSync(createCall?.bodyFilePath ?? "")).toBe(false);
      // Did not invoke gh pr edit
      expect(
        calls.some(
          (c) =>
            c.command === "gh" && c.args[0] === "pr" && c.args[1] === "edit",
        ),
      ).toBe(false);
    });

    it("invokes gh pr edit <number> --title 'chore: release development to main' --body-file <tmpFile> when commits > 0 and gh pr list returns an existing open PR (AC.3, FR-7, T005)", () => {
      const { runner, calls } = createStubRunner((command, args) => {
        if (command === "git" && args[0] === "fetch") {
          return { exitCode: 0, stdout: "", stderr: "" };
        }
        if (command === "git" && args[0] === "rev-list") {
          return { exitCode: 0, stdout: "3\n", stderr: "" };
        }
        if (command === "git" && args[0] === "log") {
          return {
            exitCode: 0,
            stdout:
              "333cccc\tfeat: third commit\tCarol\n222bbbb\tfix: second commit\tBob\n111aaaa\tfeat: first commit\tAlice\n",
            stderr: "",
          };
        }
        if (command === "gh" && args[0] === "pr" && args[1] === "list") {
          return {
            exitCode: 0,
            stdout: JSON.stringify([
              {
                number: 42,
                url: "https://github.com/wtaiatella/applyCopilot/pull/42",
              },
            ]),
            stderr: "",
          };
        }
        if (command === "gh" && args[0] === "pr" && args[1] === "edit") {
          return {
            exitCode: 0,
            stdout: "https://github.com/wtaiatella/applyCopilot/pull/42\n",
            stderr: "",
          };
        }
        if (command === "gh" && args[0] === "pr" && args[1] === "merge") {
          return { exitCode: 0, stdout: "", stderr: "" };
        }
        throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
      });

      const result = syncRollingReleasePr({ runner, writeSummary: false });

      expect(result.action).toBe("updated");
      expect(result.commitsAhead).toBe(3);
      expect(result.prNumber).toBe(42);
      expect(result.prUrl).toBe(
        "https://github.com/wtaiatella/applyCopilot/pull/42",
      );

      const editCall = calls.find(
        (c) => c.command === "gh" && c.args[0] === "pr" && c.args[1] === "edit",
      );
      expect(editCall).toBeDefined();
      expect(editCall?.args.slice(0, 6)).toEqual([
        "pr",
        "edit",
        "42",
        "--title",
        RELEASE_PR_TITLE,
        "--body-file",
      ]);
      expect(editCall?.bodyFileContent).toContain(
        "- 333cccc feat: third commit (Carol)",
      );
      expect(editCall?.bodyFileContent).toContain(
        "- **Commits ahead of `main`:** 3",
      );
      // Temporary file is cleaned up in finally
      expect(fs.existsSync(editCall?.bodyFilePath ?? "")).toBe(false);
      // Did not create a duplicate PR
      expect(
        calls.some(
          (c) =>
            c.command === "gh" && c.args[0] === "pr" && c.args[1] === "create",
        ),
      ).toBe(false);
    });

    it("prevents shell injection by writing commit subjects containing $(whoami), backticks, quotes, and semicolons verbatim to --body-file without shell interpolation (NFR Security & Privacy, T005, T007)", () => {
      const maliciousSubject =
        "feat: handle $(whoami) `id` \"double\" 'single' ; rm -rf / && echo pwned";
      const maliciousAuthor = "Attacker $(uname -a) `id`";

      const { runner, calls } = createStubRunner((command, args) => {
        if (command === "git" && args[0] === "fetch") {
          return { exitCode: 0, stdout: "", stderr: "" };
        }
        if (command === "git" && args[0] === "rev-list") {
          return { exitCode: 0, stdout: "1\n", stderr: "" };
        }
        if (command === "git" && args[0] === "log") {
          return {
            exitCode: 0,
            stdout: `deadbee\t${maliciousSubject}\t${maliciousAuthor}\n`,
            stderr: "",
          };
        }
        if (command === "gh" && args[0] === "pr" && args[1] === "list") {
          return { exitCode: 0, stdout: "[]", stderr: "" };
        }
        if (command === "gh" && args[0] === "pr" && args[1] === "create") {
          return {
            exitCode: 0,
            stdout: "https://github.com/wtaiatella/applyCopilot/pull/99\n",
            stderr: "",
          };
        }
        if (command === "gh" && args[0] === "pr" && args[1] === "merge") {
          return { exitCode: 0, stdout: "", stderr: "" };
        }
        throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
      });

      const result = syncRollingReleasePr({ runner, writeSummary: false });

      expect(result.action).toBe("created");
      const createCall = calls.find(
        (c) =>
          c.command === "gh" && c.args[0] === "pr" && c.args[1] === "create",
      );
      expect(createCall).toBeDefined();

      // Verify no commit subject or body content was passed as a CLI argument
      for (const arg of createCall?.args ?? []) {
        expect(arg).not.toContain("$(whoami)");
        expect(arg).not.toContain("rm -rf");
        expect(arg).not.toContain("`id`");
      }

      // Verify the untrusted payload was written verbatim inside the --body-file
      expect(createCall?.bodyFileContent).toContain(
        `- deadbee ${maliciousSubject} (${maliciousAuthor})`,
      );
    });

    it("writes ## Rolling Release Pull Request summary via runCli(['release']) when GITHUB_STEP_SUMMARY is set", () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "release-pr-summary-"),
      );
      const summaryFile = path.join(tempDir, "step-summary.md");
      const writeSpy = jest
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);

      const { runner } = createStubRunner((command, args) => {
        if (command === "git" && args[0] === "fetch") {
          return { exitCode: 0, stdout: "", stderr: "" };
        }
        if (command === "git" && args[0] === "rev-list") {
          return { exitCode: 0, stdout: "0\n", stderr: "" };
        }
        throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
      });

      try {
        const exitCode = runCli(
          ["release"],
          {
            NODE_ENV: "test",
            GITHUB_STEP_SUMMARY: summaryFile,
          },
          runner,
        );

        expect(exitCode).toBe(0);
        const summaryContent = fs.readFileSync(summaryFile, "utf8");
        expect(summaryContent).toContain("## Rolling Release Pull Request");
        expect(summaryContent).toContain(
          "| Action taken | `skipped (0 commits ahead of main)` |",
        );
        expect(summaryContent).toContain("| Commits ahead of `main` | 0 |");
      } finally {
        writeSpy.mockRestore();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("formats created/updated ReleasePrResult in formatReleasePrSummary()", () => {
      const summary = formatReleasePrSummary({
        action: "created",
        commitsAhead: 4,
        prNumber: 55,
        prUrl: "https://github.com/wtaiatella/applyCopilot/pull/55",
      });

      expect(summary).toContain("## Rolling Release Pull Request");
      expect(summary).toContain("| Action taken | `created` |");
      expect(summary).toContain(
        "| Pull Request | [#55](https://github.com/wtaiatella/applyCopilot/pull/55) |",
      );
      expect(summary).toContain("| Commits ahead of `main` | 4 |");
    });
  });

  describe("Workflow Contract Checks — release-pr job (Phase 2, T006)", () => {
    const repoRoot = path.resolve(__dirname, "../..");
    const ciWorkflowPath = path.join(repoRoot, ".github/workflows/ci.yml");

    it("defines jobs.release-pr with needs: [verify], development push condition, least-privilege write permissions, and concurrency serialization (T006, AC.3, AC.4)", () => {
      const workflowYaml = fs.readFileSync(ciWorkflowPath, "utf8");

      // Job definition and dependency on verify
      expect(workflowYaml).toMatch(
        /release-pr:\s*\n[\s\S]*?needs:\s*\[verify\]/,
      );

      // Condition guarding push to refs/heads/development and verify success
      expect(workflowYaml).toContain(
        "if: github.event_name == 'push' && github.ref == 'refs/heads/development' && needs.verify.result == 'success'",
      );

      // Least-privilege write permissions scoped to release-pr job
      expect(workflowYaml).toMatch(
        /release-pr:[\s\S]*?permissions:\s*\n\s*contents:\s*write\s*\n\s*pull-requests:\s*write/,
      );

      // Concurrency serialization without cancelling in-progress PR sync
      expect(workflowYaml).toMatch(
        /release-pr:[\s\S]*?concurrency:\s*\n\s*group:\s*release-pr-development-to-main\s*\n\s*cancel-in-progress:\s*false/,
      );

      // Full history checkout and CLI release invocation
      expect(workflowYaml).toMatch(/fetch-depth:\s*0/);
      expect(workflowYaml).toContain(
        "GH_TOKEN: ${{ secrets.RELEASE_PR_TOKEN || github.token }}",
      );
      expect(workflowYaml).toContain(
        "node --experimental-strip-types src/lib/ci/release-pr.ts release",
      );
    });
  });
});

type MergeHandler = (args: readonly string[]) => CommandResult;

interface ReleaseScenarioOptions {
  existingPr?: { number: number; url: string };
  onMerge?: MergeHandler;
  overrides?: (
    command: string,
    args: readonly string[],
  ) => CommandResult | undefined;
}

function createReleaseScenarioRunner(options: ReleaseScenarioOptions = {}): {
  runner: CommandRunner;
  calls: RecordedCall[];
} {
  return createStubRunner((command, args) => {
    const override = options.overrides?.(command, args);
    if (override) {
      return override;
    }
    if (command === "git" && args[0] === "fetch") {
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    if (command === "git" && args[0] === "rev-list") {
      return { exitCode: 0, stdout: "2\n", stderr: "" };
    }
    if (command === "git" && args[0] === "log") {
      return {
        exitCode: 0,
        stdout: "abc1234\tfeat: first\tAlice\ndef5678\tfix: second\tBob\n",
        stderr: "",
      };
    }
    if (command === "gh" && args[0] === "pr" && args[1] === "list") {
      return {
        exitCode: 0,
        stdout: JSON.stringify(options.existingPr ? [options.existingPr] : []),
        stderr: "",
      };
    }
    if (command === "gh" && args[0] === "pr" && args[1] === "create") {
      return {
        exitCode: 0,
        stdout: "https://github.com/wtaiatella/applyCopilot/pull/19\n",
        stderr: "",
      };
    }
    if (command === "gh" && args[0] === "pr" && args[1] === "edit") {
      return {
        exitCode: 0,
        stdout: `${options.existingPr?.url ?? ""}\n`,
        stderr: "",
      };
    }
    if (command === "gh" && args[0] === "pr" && args[1] === "merge") {
      return options.onMerge
        ? options.onMerge(args)
        : { exitCode: 0, stdout: "", stderr: "" };
    }
    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
  });
}

function findMergeCalls(calls: readonly RecordedCall[]): RecordedCall[] {
  return calls.filter(
    (c) => c.command === "gh" && c.args[0] === "pr" && c.args[1] === "merge",
  );
}

describe("release-pr — Phase 3 (US3: Human Approval Gate & Automated Release Merge)", () => {
  const existingPr = {
    number: 42,
    url: "https://github.com/wtaiatella/applyCopilot/pull/42",
  };

  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    writeSpy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    writeSpy.mockRestore();
  });

  const loggedWarnings = (): string[] =>
    logSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .filter((line: string) => line.startsWith("::warning::"));

  describe("auto-merge enablement (FR-8, AC.5, T008)", () => {
    it("invokes 'gh pr merge <n> --auto --merge' (no --delete-branch) after creating the Release PR and reports autoMergeEnabled: true", () => {
      const { runner, calls } = createReleaseScenarioRunner();

      const result = syncRollingReleasePr({ runner, writeSummary: false });

      expect(result.action).toBe("created");
      expect(result.prNumber).toBe(19);
      expect(result.autoMergeEnabled).toBe(true);
      expect(result.warning).toBeUndefined();

      const mergeCalls = findMergeCalls(calls);
      expect(mergeCalls).toHaveLength(1);
      expect(mergeCalls[0].args).toEqual([
        "pr",
        "merge",
        "19",
        "--auto",
        "--merge",
      ]);
      expect(mergeCalls[0].args).not.toContain("--delete-branch");
      expect(mergeCalls[0].args).not.toContain("--squash");
      expect(mergeCalls[0].args).not.toContain("--rebase");

      // Merge is requested only after the PR was created
      const createIndex = calls.findIndex(
        (c) => c.command === "gh" && c.args[1] === "create",
      );
      expect(calls.indexOf(mergeCalls[0])).toBeGreaterThan(createIndex);
      expect(loggedWarnings()).toHaveLength(0);
    });

    it("invokes 'gh pr merge <n> --auto --merge' after updating the existing Release PR in-place and reports autoMergeEnabled: true", () => {
      const { runner, calls } = createReleaseScenarioRunner({ existingPr });

      const result = syncRollingReleasePr({ runner, writeSummary: false });

      expect(result.action).toBe("updated");
      expect(result.prNumber).toBe(42);
      expect(result.autoMergeEnabled).toBe(true);
      expect(result.warning).toBeUndefined();

      const mergeCalls = findMergeCalls(calls);
      expect(mergeCalls).toHaveLength(1);
      expect(mergeCalls[0].args).toEqual([
        "pr",
        "merge",
        "42",
        "--auto",
        "--merge",
      ]);
      expect(mergeCalls[0].args).not.toContain("--delete-branch");

      const editIndex = calls.findIndex(
        (c) => c.command === "gh" && c.args[1] === "edit",
      );
      expect(calls.indexOf(mergeCalls[0])).toBeGreaterThan(editIndex);
      expect(loggedWarnings()).toHaveLength(0);
    });

    it("does not request auto-merge when the Release PR is skipped (0 commits ahead)", () => {
      const { runner, calls } = createReleaseScenarioRunner({
        overrides: (command, args) =>
          command === "git" && args[0] === "rev-list"
            ? { exitCode: 0, stdout: "0\n", stderr: "" }
            : undefined,
      });

      const result = syncRollingReleasePr({ runner, writeSummary: false });

      expect(result.action).toBe("skipped");
      expect(result.autoMergeEnabled).toBeUndefined();
      expect(findMergeCalls(calls)).toHaveLength(0);
    });
  });

  describe("graceful FR-9 fallback when auto-merge cannot be enabled", () => {
    it("keeps the created Release PR, returns autoMergeEnabled: false with a remediation warning, and emits ::warning:: when gh pr merge exits non-zero", () => {
      const { runner, calls } = createReleaseScenarioRunner({
        onMerge: () => ({
          exitCode: 1,
          stdout: "",
          stderr: "auto-merge is not allowed for this repository",
        }),
      });

      let result: ReturnType<typeof syncRollingReleasePr> | undefined;
      expect(() => {
        result = syncRollingReleasePr({ runner, writeSummary: false });
      }).not.toThrow();

      expect(result?.action).toBe("created");
      expect(result?.prNumber).toBe(19);
      expect(result?.autoMergeEnabled).toBe(false);
      expect(result?.warning).toEqual(expect.any(String));
      expect(result?.warning).toContain("#19");
      expect(result?.warning).toContain(
        "auto-merge is not allowed for this repository",
      );
      expect(result?.warning).toContain("merged manually");
      expect(result?.warning).toContain("Allow auto-merge");
      expect(result?.warning).toContain("Settings → Branches");
      expect(findMergeCalls(calls)).toHaveLength(1);

      const warnings = loggedWarnings();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toBe(`::warning::${result?.warning ?? ""}`);
    });

    it("keeps the updated Release PR and degrades gracefully when the merge runner throws", () => {
      const { runner } = createReleaseScenarioRunner({
        existingPr,
        onMerge: () => {
          throw new Error("spawn gh ENOENT");
        },
      });

      const result = syncRollingReleasePr({ runner, writeSummary: false });

      expect(result.action).toBe("updated");
      expect(result.prNumber).toBe(42);
      expect(result.autoMergeEnabled).toBe(false);
      expect(result.warning).toContain("#42");
      expect(result.warning).toContain("spawn gh ENOENT");
      expect(result.warning).toContain("Allow auto-merge");
      expect(loggedWarnings()).toHaveLength(1);
    });

    it("writes the auto-merge warning into $GITHUB_STEP_SUMMARY and still exits 0 via runCli(['release'])", () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "release-pr-phase3-"),
      );
      const summaryFile = path.join(tempDir, "step-summary.md");
      const { runner } = createReleaseScenarioRunner({
        onMerge: () => ({
          exitCode: 1,
          stdout: "",
          stderr: "auto-merge is not allowed",
        }),
      });

      try {
        const exitCode = runCli(
          ["release"],
          { NODE_ENV: "test", GITHUB_STEP_SUMMARY: summaryFile },
          runner,
        );

        expect(exitCode).toBe(0);
        const summary = fs.readFileSync(summaryFile, "utf8");
        expect(summary).toContain("| Action taken | `created` |");
        expect(summary).toContain(
          "| Auto-merge | ⚠️ Not enabled (manual merge required) |",
        );
        expect(summary).toContain("> ⚠️ **Warning:** Auto-merge could not");
        expect(summary).toContain("auto-merge is not allowed");
        expect(summary).toContain("Allow auto-merge");
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("buildAutoMergeWarning() and formatReleasePrSummary() auto-merge rendering", () => {
    it("builds remediation guidance with and without failure details", () => {
      const withDetails = buildAutoMergeWarning("#7", "  not allowed  ");
      expect(withDetails).toContain(
        "Auto-merge could not be enabled for PR #7 (not allowed).",
      );
      expect(withDetails).toContain("must be merged manually");
      expect(withDetails).toContain('"Allow auto-merge" in Settings → General');
      expect(withDetails).toContain(
        `branch protection (required status checks) for \`${RELEASE_BASE_BRANCH}\` in Settings → Branches`,
      );

      const withoutDetails = buildAutoMergeWarning("#7");
      expect(withoutDetails).toContain(
        "Auto-merge could not be enabled for PR #7.",
      );
      expect(withoutDetails).not.toContain("()");
      expect(buildAutoMergeWarning("#7", "   ")).toBe(withoutDetails);
    });

    it("renders an enabled auto-merge row without a warning block", () => {
      const summary = formatReleasePrSummary({
        action: "updated",
        commitsAhead: 3,
        prNumber: 42,
        prUrl: existingPr.url,
        autoMergeEnabled: true,
      });

      expect(summary).toContain(
        "| Auto-merge | ✅ Enabled (`--auto --merge`) |",
      );
      expect(summary).not.toContain("**Warning:**");
    });

    it("renders a not-enabled auto-merge row and the warning block", () => {
      const warning = buildAutoMergeWarning("#42", "not allowed");
      const summary = formatReleasePrSummary({
        action: "updated",
        commitsAhead: 3,
        prNumber: 42,
        prUrl: existingPr.url,
        autoMergeEnabled: false,
        warning,
      });

      expect(summary).toContain(
        "| Auto-merge | ⚠️ Not enabled (manual merge required) |",
      );
      expect(summary).toContain(`> ⚠️ **Warning:** ${warning}`);
    });

    it("omits the auto-merge row when autoMergeEnabled is undefined (skipped action)", () => {
      const summary = formatReleasePrSummary({
        action: "skipped",
        commitsAhead: 0,
      });

      expect(summary).not.toContain("| Auto-merge |");
      expect(summary).not.toContain("**Warning:**");
    });
  });

  describe("fatal CLI error reporting (error handling strategy)", () => {
    let tempDir: string;
    let summaryFile: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "release-pr-fatal-"));
      summaryFile = path.join(tempDir, "step-summary.md");
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const fatalCases: Array<{
      name: string;
      existingPr?: { number: number; url: string };
      matches: (command: string, args: readonly string[]) => boolean;
      expectedMessage: string;
    }> = [
      {
        name: "git fetch",
        matches: (command, args) => command === "git" && args[0] === "fetch",
        expectedMessage: "git fetch origin main development failed",
      },
      {
        name: "git rev-list",
        matches: (command, args) => command === "git" && args[0] === "rev-list",
        expectedMessage:
          "git rev-list --count origin/main..origin/development failed",
      },
      {
        name: "gh pr list",
        matches: (command, args) => command === "gh" && args[1] === "list",
        expectedMessage: "gh pr list failed",
      },
      {
        name: "gh pr create",
        matches: (command, args) => command === "gh" && args[1] === "create",
        expectedMessage: "gh pr create failed",
      },
      {
        name: "gh pr edit",
        existingPr,
        matches: (command, args) => command === "gh" && args[1] === "edit",
        expectedMessage: "gh pr edit 42 failed",
      },
    ];

    it.each(fatalCases)(
      "throws from syncRollingReleasePr() and does not request auto-merge when $name fails",
      ({ existingPr: pr, matches, expectedMessage }) => {
        const { runner, calls } = createReleaseScenarioRunner({
          existingPr: pr,
          overrides: (command, args) =>
            matches(command, args)
              ? { exitCode: 1, stdout: "", stderr: "fatal: boom" }
              : undefined,
        });

        expect(() =>
          syncRollingReleasePr({ runner, writeSummary: false }),
        ).toThrow(expectedMessage);
        expect(findMergeCalls(calls)).toHaveLength(0);
      },
    );

    it.each(fatalCases)(
      "returns exit code 1 from runCli(['release']) and writes a diagnostic section to $GITHUB_STEP_SUMMARY when $name fails",
      ({ existingPr: pr, matches, expectedMessage }) => {
        const { runner } = createReleaseScenarioRunner({
          existingPr: pr,
          overrides: (command, args) =>
            matches(command, args)
              ? { exitCode: 1, stdout: "", stderr: "fatal: boom" }
              : undefined,
        });

        const exitCode = runCli(
          ["release"],
          { NODE_ENV: "test", GITHUB_STEP_SUMMARY: summaryFile },
          runner,
        );

        expect(exitCode).toBe(1);
        const summary = fs.readFileSync(summaryFile, "utf8");
        expect(summary).toContain("## Rolling Release Pull Request");
        expect(summary).toContain("❌ **Error:**");
        expect(summary).toContain(expectedMessage);
        expect(summary).toContain("fatal: boom");
        expect(errorSpy).toHaveBeenCalledWith(
          expect.stringContaining("[release-pr] Release PR sync failed:"),
        );
      },
    );
  });
});
