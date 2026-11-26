/**
 * @jest-environment node
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRawUnsafe: jest.fn(),
  },
}));

import { prisma } from "@/lib/db/prisma";
import { SkillKind } from "@prisma/client";
import {
  fetchSkillVectors,
  scoreMaxCosine,
  getMaxCosineScores,
} from "@/services/skillVectorLookupService";

const mockQueryRawUnsafe = prisma.$queryRawUnsafe as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

// Known-angle fixture vectors (2D, extended to a shared length isn't needed — cosine math is
// dimension-agnostic as long as both vectors share it):
//   IDENTICAL: same direction as PROFILE_A -> cosine 1.0 (100)
//   ORTHOGONAL: 90 degrees from PROFILE_A -> cosine 0.0 (0)
//   OPPOSITE: 180 degrees from PROFILE_A -> cosine -1.0 -> clamped to 0
//   FORTY_FIVE: 45 degrees from PROFILE_A -> cosine sqrt(2)/2 ≈ 0.7071 (71, rounded)
const PROFILE_A = [1, 0];
const IDENTICAL = [2, 0]; // same direction, different magnitude — cosine unaffected
const ORTHOGONAL = [0, 1];
const OPPOSITE = [-1, 0];
const FORTY_FIVE = [1, 1];

// 2D unit vector with exact cosine similarity `cos` against PROFILE_A ([1, 0]).
function vectorWithCosine(cos: number): number[] {
  return [cos, Math.sqrt(Math.max(0, 1 - cos * cos))];
}

function mockVectorRows(
  rows: Array<{ skill: string; embedding: number[] }>,
): void {
  mockQueryRawUnsafe.mockResolvedValueOnce(
    rows.map((r) => ({
      skill: r.skill,
      embedding: JSON.stringify(r.embedding),
    })),
  );
}

// --- fetchSkillVectors -------------------------------------------------------------------

describe("fetchSkillVectors", () => {
  it("returns an empty map without querying when given no skills", async () => {
    const result = await fetchSkillVectors([], SkillKind.HARD);
    expect(result.size).toBe(0);
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });

  it("issues exactly ONE batched query for N distinct skill strings (not N+1)", async () => {
    mockVectorRows([
      { skill: "react", embedding: IDENTICAL },
      { skill: "typescript", embedding: ORTHOGONAL },
    ]);

    const result = await fetchSkillVectors(
      ["React", "TypeScript", "react"],
      SkillKind.HARD,
    );

    expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(1);
    // Deduped + lowercased before the query — 2 distinct skill params, plus the kind param.
    const [, ...params] = mockQueryRawUnsafe.mock.calls[0];
    expect(params).toEqual(["react", "typescript", SkillKind.HARD]);
    expect(result.get("react")).toEqual(IDENTICAL);
    expect(result.get("typescript")).toEqual(ORTHOGONAL);
  });

  it("omits skills with no cached vector yet (not-yet-backfilled) from the returned map", async () => {
    mockVectorRows([{ skill: "react", embedding: IDENTICAL }]);

    const result = await fetchSkillVectors(["react", "cobol"], SkillKind.HARD);

    expect(result.has("react")).toBe(true);
    expect(result.has("cobol")).toBe(false);
  });

  it(
    "scopes the query to the requested kind — a row seeded under a different kind for a " +
      "different skill string is excluded (FR-03 read-path isolation, 015 rework)",
    async () => {
      // The mock only returns what the (mocked) WHERE kind = $N clause would match — "react" is
      // HARD, "empathy" is SOFT. Fetching with kind=HARD must not surface the SOFT row at all.
      mockVectorRows([{ skill: "react", embedding: IDENTICAL }]);

      const result = await fetchSkillVectors(
        ["react", "empathy"],
        SkillKind.HARD,
      );

      const [, ...params] = mockQueryRawUnsafe.mock.calls[0];
      expect(params).toEqual(["react", "empathy", SkillKind.HARD]);
      expect(result.has("react")).toBe(true);
      expect(result.has("empathy")).toBe(false);
    },
  );
});

// --- scoreMaxCosine (pure, in-memory math) ------------------------------------------------

describe("scoreMaxCosine", () => {
  it("returns 100 and empty itemScores when the target list is empty (mirrors computeOverlap's convention)", () => {
    const vectors = new Map([["react", PROFILE_A]]);
    const result = scoreMaxCosine([], ["React"], vectors);
    expect(result).toEqual({ score: 100, itemScores: {} });
  });

  it("computes known-angle cosine similarity correctly: identical direction -> 100", () => {
    const vectors = new Map([
      ["profile-skill", PROFILE_A],
      ["target-skill", IDENTICAL],
    ]);
    const result = scoreMaxCosine(["Target-Skill"], ["Profile-Skill"], vectors);
    expect(result.itemScores["Target-Skill"]).toBe(100);
    expect(result.score).toBe(100);
  });

  it("computes known-angle cosine similarity correctly: orthogonal -> 0", () => {
    const vectors = new Map([
      ["profile-skill", PROFILE_A],
      ["target-skill", ORTHOGONAL],
    ]);
    const result = scoreMaxCosine(["Target-Skill"], ["Profile-Skill"], vectors);
    expect(result.itemScores["Target-Skill"]).toBe(0);
  });

  it("clamps a negative (opposite-direction) cosine similarity to 0", () => {
    const vectors = new Map([
      ["profile-skill", PROFILE_A],
      ["target-skill", OPPOSITE],
    ]);
    const result = scoreMaxCosine(["Target-Skill"], ["Profile-Skill"], vectors);
    expect(result.itemScores["Target-Skill"]).toBe(0);
  });

  it("computes a known 45-degree partial-credit similarity (~71)", () => {
    const vectors = new Map([
      ["profile-skill", PROFILE_A],
      ["target-skill", FORTY_FIVE],
    ]);
    const result = scoreMaxCosine(["Target-Skill"], ["Profile-Skill"], vectors);
    expect(result.itemScores["Target-Skill"]).toBe(71);
  });

  it("takes the MAX cosine across multiple profile vectors for a single target", () => {
    const vectors = new Map([
      ["orthogonal-profile-skill", ORTHOGONAL],
      ["identical-profile-skill", IDENTICAL],
      ["target-skill", PROFILE_A],
    ]);
    const result = scoreMaxCosine(
      ["Target-Skill"],
      ["Orthogonal-Profile-Skill", "Identical-Profile-Skill"],
      vectors,
    );
    expect(result.itemScores["Target-Skill"]).toBe(100);
  });

  it("averages per-target scores into the aggregate score", () => {
    const vectors = new Map([
      ["profile-skill", PROFILE_A],
      ["identical", IDENTICAL],
      ["orthogonal", ORTHOGONAL],
    ]);
    const result = scoreMaxCosine(
      ["Identical", "Orthogonal"],
      ["Profile-Skill"],
      vectors,
    );
    expect(result.itemScores["Identical"]).toBe(100);
    expect(result.itemScores["Orthogonal"]).toBe(0);
    expect(result.score).toBe(50);
  });

  it("degrades a not-yet-backfilled target skill (no vector) to 0 rather than erroring", () => {
    const vectors = new Map([["profile-skill", PROFILE_A]]);
    const result = scoreMaxCosine(
      ["Never-Backfilled-Skill"],
      ["Profile-Skill"],
      vectors,
    );
    expect(result.itemScores["Never-Backfilled-Skill"]).toBe(0);
    expect(result.score).toBe(0);
  });

  it("degrades every target to 0 when no profile vectors are comparable at all", () => {
    const vectors = new Map<string, number[]>();
    const result = scoreMaxCosine(["React", "TypeScript"], ["React"], vectors);
    expect(result).toEqual({
      score: 0,
      itemScores: { React: 0, TypeScript: 0 },
    });
  });

  it("retains itemScore at the exact matchThreshold boundary (itemScore === matchThreshold)", () => {
    const vectors = new Map([
      ["profile-skill", PROFILE_A],
      ["exact-boundary", vectorWithCosine(0.83)],
      ["rounded-boundary", vectorWithCosine(0.826)], // rounds to 83 before threshold check
    ]);

    const exact = scoreMaxCosine(["Exact-Boundary"], ["Profile-Skill"], vectors, 83);
    expect(exact).toEqual({
      score: 83,
      itemScores: { "Exact-Boundary": 83 },
    });

    const rounded = scoreMaxCosine(["Rounded-Boundary"], ["Profile-Skill"], vectors, 83);
    expect(rounded).toEqual({
      score: 83,
      itemScores: { "Rounded-Boundary": 83 },
    });
  });

  it("zeros itemScore in the dimension average when itemScore === matchThreshold - 1 while preserving raw itemScores", () => {
    const vectors = new Map([
      ["profile-skill", PROFILE_A],
      ["just-below", vectorWithCosine(0.82)],
    ]);

    const result = scoreMaxCosine(["Just-Below"], ["Profile-Skill"], vectors, 83);
    expect(result).toEqual({
      score: 0,
      itemScores: { "Just-Below": 82 },
    });
  });

  it("averages matched targets with zeroed below-threshold misses in mixed dimensions", () => {
    const vectors = new Map([
      ["profile-skill", PROFILE_A],
      ["ninety", vectorWithCosine(0.9)],
      ["seventy", vectorWithCosine(0.7)],
      ["identical", IDENTICAL],
      ["forty-five", FORTY_FIVE],
    ]);

    // 90 (>= 83) and 70 (< 83 -> 0) => (90 + 0) / 2 = 45
    const ninetyAndSeventy = scoreMaxCosine(
      ["Ninety", "Seventy"],
      ["Profile-Skill"],
      vectors,
      83,
    );
    expect(ninetyAndSeventy).toEqual({
      score: 45,
      itemScores: { Ninety: 90, Seventy: 70 },
    });

    // 100 (>= 83) and 71 (< 83 -> 0) => (100 + 0) / 2 = 50
    const hundredAndSeventyOne = scoreMaxCosine(
      ["Identical", "Forty-Five"],
      ["Profile-Skill"],
      vectors,
      83,
    );
    expect(hundredAndSeventyOne).toEqual({
      score: 50,
      itemScores: { Identical: 100, "Forty-Five": 71 },
    });
  });

  it("returns score 0 (never 100) when all targets fall below matchThreshold while preserving raw itemScores", () => {
    const vectors = new Map([
      ["profile-skill", PROFILE_A],
      ["just-below", vectorWithCosine(0.82)],
      ["forty-five", FORTY_FIVE],
    ]);

    const result = scoreMaxCosine(
      ["Just-Below", "Forty-Five"],
      ["Profile-Skill"],
      vectors,
      83,
    );
    expect(result).toEqual({
      score: 0,
      itemScores: { "Just-Below": 82, "Forty-Five": 71 },
    });
  });

  it("returns 100 and empty itemScores for empty targets even when matchThreshold is provided", () => {
    const vectors = new Map([["react", PROFILE_A]]);
    const result = scoreMaxCosine([], ["React"], vectors, 83);
    expect(result).toEqual({ score: 100, itemScores: {} });
  });

  it("preserves the raw cosine average when matchThreshold is omitted (defaults to 0)", () => {
    const vectors = new Map([
      ["profile-skill", PROFILE_A],
      ["identical", IDENTICAL],
      ["forty-five", FORTY_FIVE],
    ]);

    // (100 + 71) / 2 = 85.5 -> 86 when matchThreshold is omitted
    const result = scoreMaxCosine(
      ["Identical", "Forty-Five"],
      ["Profile-Skill"],
      vectors,
    );
    expect(result).toEqual({
      score: 86,
      itemScores: { Identical: 100, "Forty-Five": 71 },
    });
  });
});

// --- getMaxCosineScores (one-shot fetch + score wrapper) ----------------------------------

describe("getMaxCosineScores", () => {
  it("returns 100 without querying when the target list is empty", async () => {
    const result = await getMaxCosineScores([], ["React"], SkillKind.HARD);
    expect(result).toEqual({ score: 100, itemScores: {} });
    expect(mockQueryRawUnsafe).not.toHaveBeenCalled();
  });

  it("issues exactly ONE batched query for N distinct target+profile skill strings", async () => {
    mockVectorRows([
      { skill: "react", embedding: PROFILE_A },
      { skill: "typescript", embedding: IDENTICAL },
    ]);

    const result = await getMaxCosineScores(
      ["TypeScript"],
      ["React"],
      SkillKind.HARD,
    );

    expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(result.itemScores["TypeScript"]).toBe(100);
    expect(result.score).toBe(100);
  });

  it("threads the kind parameter through to fetchSkillVectors", async () => {
    mockVectorRows([{ skill: "empathy", embedding: PROFILE_A }]);

    await getMaxCosineScores(["Empathy"], [], SkillKind.SOFT);

    const [, ...params] = mockQueryRawUnsafe.mock.calls[0];
    expect(params[params.length - 1]).toBe(SkillKind.SOFT);
  });

  it("forwards optional matchThreshold to scoreMaxCosine", async () => {
    mockVectorRows([
      { skill: "react", embedding: PROFILE_A },
      { skill: "typescript", embedding: IDENTICAL },
      { skill: "go", embedding: FORTY_FIVE },
    ]);

    const result = await getMaxCosineScores(
      ["TypeScript", "Go"],
      ["React"],
      SkillKind.HARD,
      83,
    );

    expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      score: 50,
      itemScores: { TypeScript: 100, Go: 71 },
    });
  });
});
