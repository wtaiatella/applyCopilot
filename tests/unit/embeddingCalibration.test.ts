import { EMBEDDING_DIMENSION } from "@/lib/ai/vector-service";
import { getSimilarityThreshold } from "@/services/skillCanonicalizationService";
import {
  getMatchDisplayThreshold,
  scoreMaxCosine,
} from "@/services/skillVectorLookupService";
import { prisma } from "@/lib/db/prisma";

jest.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemConfig: {
      findUnique: jest.fn(),
    },
  },
}));

/**
 * Constructs a pair of unit vectors in `EMBEDDING_DIMENSION` (1024d) space whose
 * exact cosine similarity equals `targetCosine` (in [-1, 1]).
 */
function makePairWithCosine(targetCosine: number): [number[], number[]] {
  const a = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  const b = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  a[0] = 1;
  b[0] = targetCosine;
  b[1] = Math.sqrt(Math.max(0, 1 - targetCosine * targetCosine));
  return [a, b];
}

/**
 * Curated empirical benchmark measurements from `qwen3-embedding:0.6b` (1024d) via LiteLLM
 * (see `docs/specs/2026-11-13-APC-45-1024d-embeddings/spectech.md` Decision 3).
 */
const TRUE_POSITIVE_PAIRS = [
  { skillA: "PostgreSQL", skillB: "Postgres", cosine: 0.976, aliasExpected: true, displayExpected: true },
  { skillA: "Next.js", skillB: "NextJS", cosine: 0.9731, aliasExpected: true, displayExpected: true },
  { skillA: "Kubernetes", skillB: "K8s", cosine: 0.9708, aliasExpected: true, displayExpected: true },
  { skillA: "Amazon Web Services", skillB: "AWS", cosine: 0.8859, aliasExpected: true, displayExpected: true },
  { skillA: "REST APIs", skillB: "RESTful API", cosine: 0.8803, aliasExpected: true, displayExpected: true },
  { skillA: "React.js", skillB: "React", cosine: 0.8337, aliasExpected: true, displayExpected: true },
  // Abbreviation pairs: captured by the recall-oriented alias gate (60) + LLM confirmation,
  // intentionally below the no-LLM display gate (83).
  { skillA: "Node.js", skillB: "Node", cosine: 0.6505, aliasExpected: true, displayExpected: false },
  { skillA: "TypeScript", skillB: "TS", cosine: 0.6344, aliasExpected: true, displayExpected: false },
] as const;

const NEAR_NAME_FALSE_POSITIVE_PAIRS = [
  { skillA: "Go", skillB: "Rust", cosine: 0.5745 },
  { skillA: "PHP", skillB: "Python", cosine: 0.7061 },
  { skillA: "Java", skillB: "JavaScript", cosine: 0.7337 },
  { skillA: "Docker", skillB: "Kubernetes", cosine: 0.7853 },
  { skillA: "React", skillB: "Angular", cosine: 0.7997 },
  { skillA: "C", skillB: "C++", cosine: 0.8171 },
] as const;

describe("1024d Embedding Threshold Calibration (APC-45 / US-5)", () => {
  const mockFindUnique = prisma.systemConfig.findUnique as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockResolvedValue(null);
  });

  it("defaults to calibrated 60 (alias) and 83 (display) when SystemConfig has no overrides", async () => {
    const aliasThreshold = await getSimilarityThreshold();
    const displayThreshold = await getMatchDisplayThreshold();

    expect(EMBEDDING_DIMENSION).toBe(1024);
    expect(aliasThreshold).toBe(60);
    expect(displayThreshold).toBe(83);
  });

  it("passes all curated true-positive pairs at their calibrated gates", async () => {
    const aliasThreshold = await getSimilarityThreshold();
    const displayThreshold = await getMatchDisplayThreshold();

    for (const pair of TRUE_POSITIVE_PAIRS) {
      const [vecA, vecB] = makePairWithCosine(pair.cosine);
      const vectors = new Map<string, number[]>([
        [pair.skillA.toLowerCase(), vecA],
        [pair.skillB.toLowerCase(), vecB],
      ]);

      const { itemScores } = scoreMaxCosine([pair.skillA], [pair.skillB], vectors);
      const score = itemScores[pair.skillA];

      if (pair.aliasExpected) {
        expect(score).toBeGreaterThanOrEqual(aliasThreshold);
      }
      if (pair.displayExpected) {
        expect(score).toBeGreaterThanOrEqual(displayThreshold);
      } else {
        expect(score).toBeLessThan(displayThreshold);
      }
    }
  });

  it("rejects all curated near-name false-positive pairs under the calibrated 83 display threshold", async () => {
    const displayThreshold = await getMatchDisplayThreshold();

    for (const pair of NEAR_NAME_FALSE_POSITIVE_PAIRS) {
      const [vecA, vecB] = makePairWithCosine(pair.cosine);
      const vectors = new Map<string, number[]>([
        [pair.skillA.toLowerCase(), vecA],
        [pair.skillB.toLowerCase(), vecB],
      ]);

      const { itemScores } = scoreMaxCosine([pair.skillA], [pair.skillB], vectors);
      const score = itemScores[pair.skillA];

      expect(score).toBeLessThan(displayThreshold);
    }
  });
});
