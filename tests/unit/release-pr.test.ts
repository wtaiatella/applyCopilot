import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  formatVerificationSummary,
  readCheckOutcomesFromEnv,
  runCli,
  writeStepSummary,
  type CheckOutcomes,
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
