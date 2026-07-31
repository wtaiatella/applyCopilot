/**
 * @jest-environment node
 */

jest.mock("@/lib/ai/aiClient", () => ({
  generateJSON: jest.fn(),
}));

jest.mock("@/lib/logging/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { generateJSON } from "@/lib/ai/aiClient";
import {
  runReviewAll,
  runGenerateBullet,
  runReviewBullet,
  runGenerateSummary,
  BulletInput,
  ReviewAllResult,
  SingleBulletResult,
  GenerateSummaryResult,
  AIJobContext,
} from "@/services/profileBulletAIService";

const generateJSONMock = generateJSON as jest.Mock;

describe("profileBulletAIService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("runReviewAll", () => {
    const bullets: BulletInput[] = [
      {
        id: "b1",
        text: "Did some backend work",
        type: "BULLET",
        usedInCVs: [],
      },
      { id: "b2", text: "Built REST APIs", type: "BULLET", usedInCVs: [] },
    ];

    it("returns mixed REWRITE/MERGE/NEW suggestions when contextNotes are present", async () => {
      const fixture: ReviewAllResult = {
        suggestions: [
          {
            type: "REWRITE",
            bulletId: "b1",
            originalText: "Did some backend work",
            revisedText: "Engineered backend services",
          },
          {
            type: "MERGE",
            bulletIds: ["b1", "b2"],
            originalTexts: ["a", "b"],
            combinedText: "combined",
          },
          { type: "NEW", text: "Led migration to microservices" },
        ],
      };
      generateJSONMock.mockResolvedValue(fixture);

      const result = await runReviewAll({
        bullets,
        contextNotes: ["Led a team of 5 engineers"],
      });

      expect(generateJSONMock).toHaveBeenCalledWith(
        expect.any(String),
        "profile",
        expect.stringContaining("REWRITE"),
      );
      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions.map((s) => s.type)).toEqual([
        "REWRITE",
        "MERGE",
        "NEW",
      ]);
    });

    it("does not include NEW suggestions when contextNotes are absent (per AI response)", async () => {
      const fixture: ReviewAllResult = {
        suggestions: [
          {
            type: "REWRITE",
            bulletId: "b1",
            originalText: "Did some backend work",
            revisedText: "Engineered backend services",
          },
        ],
      };
      generateJSONMock.mockResolvedValue(fixture);

      const result = await runReviewAll({ bullets, contextNotes: [] });

      const userPrompt = generateJSONMock.mock.calls[0][0] as string;
      expect(userPrompt).toContain("None provided");
      expect(result.suggestions.every((s) => s.type !== "NEW")).toBe(true);
    });
  });

  describe("runGenerateBullet", () => {
    it("returns { revisedText: string }", async () => {
      const fixture: SingleBulletResult = {
        revisedText: "Generated a new bullet from context notes",
      };
      generateJSONMock.mockResolvedValue(fixture);

      const result = await runGenerateBullet({
        contextNotes: ["Managed a $2M budget"],
        existingBullets: ["Existing bullet text"],
      });

      expect(generateJSONMock).toHaveBeenCalledWith(
        expect.any(String),
        "profile",
        expect.any(String),
      );
      expect(result).toEqual({
        revisedText: "Generated a new bullet from context notes",
      });
    });
  });

  describe("runReviewBullet", () => {
    it("returns { revisedText: string }", async () => {
      const fixture: SingleBulletResult = {
        revisedText: "Improved bullet text",
      };
      generateJSONMock.mockResolvedValue(fixture);

      const bullet: BulletInput = {
        id: "b1",
        text: "Original bullet",
        type: "BULLET",
        usedInCVs: [],
      };
      const result = await runReviewBullet({ bullet, contextNotes: [] });

      expect(generateJSONMock).toHaveBeenCalledWith(
        expect.any(String),
        "profile",
        expect.any(String),
      );
      expect(result).toEqual({ revisedText: "Improved bullet text" });
    });
  });

  // ── CV Composer (007): jobContext-aware prompt builders (FR-7–FR-10, T030) ──────────
  describe("jobContext (CV Composer, FR-7–FR-10)", () => {
    const bullets: BulletInput[] = [
      {
        id: "b1",
        text: "Did some backend work",
        type: "BULLET",
        usedInCVs: [],
      },
      { id: "b2", text: "Built REST APIs", type: "BULLET", usedInCVs: [] },
    ];

    const fullJobContext: AIJobContext = {
      jobTitle: "Senior Backend Engineer",
      company: "Acme Corp",
      jobDescription: "Own our payments platform end to end.",
      weaknesses: ["No prior fintech experience"],
      missingSkills: ["Kafka"],
    };

    const reducedJobContext: AIJobContext = {
      jobTitle: "Senior Backend Engineer",
      company: "Acme Corp",
      jobDescription: "Own our payments platform end to end.",
      // weaknesses/missingSkills omitted — no Deep Analysis yet (FR-10)
    };

    describe("runReviewAll", () => {
      it("omits jobContext from the prompt and system prompt when not supplied (Profile's own Review All, unmodified)", async () => {
        const fixture: ReviewAllResult = { suggestions: [] };
        generateJSONMock.mockResolvedValue(fixture);

        await runReviewAll({ bullets, contextNotes: [] });

        const [userPrompt, , systemPrompt] = generateJSONMock.mock.calls[0];
        expect(userPrompt).not.toContain("TARGET JOB");
        expect(systemPrompt).not.toContain("relevanceDecisions");
      });

      it("includes the job description and asks for relevanceDecisions when jobContext is supplied (full context)", async () => {
        const fixture: ReviewAllResult = {
          suggestions: [
            {
              type: "REWRITE",
              bulletId: "b1",
              originalText: "Did some backend work",
              revisedText: "Owned backend services end to end",
              targetsGap: "No prior fintech experience",
            },
          ],
          relevanceDecisions: [
            { bulletId: "b1", include: true },
            {
              bulletId: "b2",
              include: false,
              reason: "Not relevant to this job",
            },
          ],
        };
        generateJSONMock.mockResolvedValue(fixture);

        const result = await runReviewAll({
          bullets,
          contextNotes: [],
          jobContext: fullJobContext,
        });

        const [userPrompt, , systemPrompt] = generateJSONMock.mock.calls[0];
        expect(userPrompt).toContain("TARGET JOB");
        expect(userPrompt).toContain("Senior Backend Engineer");
        expect(userPrompt).toContain("No prior fintech experience");
        expect(userPrompt).toContain("Kafka");
        expect(systemPrompt).toContain("relevanceDecisions");
        expect(result.relevanceDecisions).toHaveLength(2);
        expect(result.suggestions[0]).toMatchObject({
          targetsGap: "No prior fintech experience",
        });
      });

      it("uses the reduced-context branch when weaknesses/missingSkills are absent (FR-10)", async () => {
        const fixture: ReviewAllResult = { suggestions: [] };
        generateJSONMock.mockResolvedValue(fixture);

        await runReviewAll({
          bullets,
          contextNotes: [],
          jobContext: reducedJobContext,
        });

        const userPrompt = generateJSONMock.mock.calls[0][0] as string;
        expect(userPrompt).toContain("TARGET JOB");
        expect(userPrompt).toContain("Not available (no Deep Analysis yet)");
      });

      it("defaults relevanceDecisions to [] when the AI response omits it despite jobContext", async () => {
        generateJSONMock.mockResolvedValue({ suggestions: [] });

        const result = await runReviewAll({
          bullets,
          contextNotes: [],
          jobContext: fullJobContext,
        });

        expect(result.relevanceDecisions).toEqual([]);
      });
    });

    describe("runGenerateBullet", () => {
      it("includes TARGET JOB in the prompt when jobContext is supplied", async () => {
        generateJSONMock.mockResolvedValue({ revisedText: "New bullet" });

        await runGenerateBullet({
          contextNotes: ["Led migration"],
          existingBullets: [],
          jobContext: fullJobContext,
        });

        const userPrompt = generateJSONMock.mock.calls[0][0] as string;
        expect(userPrompt).toContain("TARGET JOB");
        expect(userPrompt).toContain("Acme Corp");
      });

      it("omits TARGET JOB when jobContext is not supplied", async () => {
        generateJSONMock.mockResolvedValue({ revisedText: "New bullet" });

        await runGenerateBullet({
          contextNotes: ["Led migration"],
          existingBullets: [],
        });

        const userPrompt = generateJSONMock.mock.calls[0][0] as string;
        expect(userPrompt).not.toContain("TARGET JOB");
      });
    });

    describe("runReviewBullet", () => {
      it("includes TARGET JOB in the prompt when jobContext is supplied", async () => {
        generateJSONMock.mockResolvedValue({ revisedText: "Improved bullet" });

        await runReviewBullet({
          bullet: bullets[0],
          contextNotes: [],
          jobContext: reducedJobContext,
        });

        const userPrompt = generateJSONMock.mock.calls[0][0] as string;
        expect(userPrompt).toContain("TARGET JOB");
        expect(userPrompt).toContain("Not available (no Deep Analysis yet)");
      });
    });

    describe("runGenerateSummary", () => {
      it("builds a prompt from experiences + jobContext and returns { content }", async () => {
        const fixture: GenerateSummaryResult = {
          content: "Backend engineer with 5 years of experience...",
        };
        generateJSONMock.mockResolvedValue(fixture);

        const result = await runGenerateSummary({
          jobContext: fullJobContext,
          experiences: [
            {
              company: "Tech Corp",
              position: "Backend Engineer",
              bulletTexts: ["Built REST APIs"],
            },
          ],
          existingSummaries: ["Existing summary variant"],
        });

        const [userPrompt, provider] = generateJSONMock.mock.calls[0];
        expect(provider).toBe("profile");
        expect(userPrompt).toContain("Tech Corp");
        expect(userPrompt).toContain("Built REST APIs");
        expect(userPrompt).toContain("Existing summary variant");
        expect(userPrompt).toContain("TARGET JOB");
        expect(result).toEqual(fixture);
      });

      it("falls back to an empty string when the AI response is missing content", async () => {
        generateJSONMock.mockResolvedValue({});

        const result = await runGenerateSummary({
          jobContext: reducedJobContext,
          experiences: [],
          existingSummaries: [],
        });

        expect(result).toEqual({ content: "" });
      });
    });
  });
});
