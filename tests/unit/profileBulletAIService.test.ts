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
  BulletInput,
  ReviewAllResult,
  SingleBulletResult,
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
});
