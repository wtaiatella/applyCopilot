import { type SkillKind } from "@prisma/client";
import { prisma } from "../lib/db/prisma";
import { logger } from "../lib/logging/logger";

/** `SystemConfig` key for the matched/missing display-classification threshold — separate from
 * `skillCanonicalizationService.getSimilarityThreshold()`'s alias-confirmation gate (default 60).
 * That threshold is recall-oriented on purpose: a false-positive top-1 candidate there only costs
 * one extra LLM call, which then makes the real yes/no decision. This threshold has no LLM
 * backstop — it directly decides what the user sees as "matched" vs "missing" — so it needs a
 * higher bar. Calibrated empirically (2026-08-24, real `gemini-embedding-001` vectors already in
 * this system's `SkillEmbedding` table) against known-should-not-match pairs (e.g. `java`↔
 * `javascript` 67.1%, `php`↔`python` 68.1%, `mysql`↔`postgresql` 70.4% — all short skill-name
 * embeddings sitting inside the anisotropy floor described in the 015 findings doc) vs.
 * known-should-match pairs (`next.js`↔`react.js` 73.8%). No single threshold cleanly separates
 * every case in this space (`rest apis`↔`restful api` — literally the same concept, worded
 * differently — measured only 68.2%, below several of the false-positive pairs above; that gap is
 * a write-path alias-merge miss, not something this read-path threshold can fix), so 72 is a
 * pragmatic default clearing the worst false positives while keeping the one strong true-positive
 * pair in the calibration set — not a value with a provably-correct margin. Tune via the admin
 * panel against real production data as it accumulates.
 */
const MATCH_DISPLAY_THRESHOLD_KEY = "SKILL_MATCH_DISPLAY_THRESHOLD";
const DEFAULT_MATCH_DISPLAY_THRESHOLD = 72;

/**
 * Reads the matched/missing display-classification threshold (FR-17) from `SystemConfig`.
 * Consumed by the caller (`GET /api/jobs/route.ts`) and passed into
 * `matchScorer.computeMatchScore`'s `skillMatchThreshold` param — kept separate from
 * `skillCanonicalizationService.getSimilarityThreshold()` (see the module-level doc above for
 * why these must not be the same value).
 */
export async function getMatchDisplayThreshold(): Promise<number> {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: MATCH_DISPLAY_THRESHOLD_KEY },
    });
    const parsed = config?.value ? parseInt(config.value, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_MATCH_DISPLAY_THRESHOLD;
  } catch (error) {
    logger.warn("skill_match_display_threshold_lookup_failed", { error });
    return DEFAULT_MATCH_DISPLAY_THRESHOLD;
  }
}

/**
 * Read-path batched vector fetch + `max-cosine` scoring (spectech.md FR-10/FR-11/FR-12,
 * Technical Decisions). Consumed by the caller (`GET /api/jobs/route.ts`, same place
 * `mustHaveSimilarity` is already fetched today) — `matchScorer.ts` itself stays I/O-free and
 * receives the resulting score as plain data, mirroring how `mustHaveSimilarity`/`profileFacts`
 * are already threaded through.
 *
 * `fetchSkillVectors` performs the ONE batched `SELECT ... WHERE skill IN (...)` per request
 * (never a per-skill or per-job query) — callers scoring many jobs in one request (the Stage-1
 * pool) call it once with the pool's full distinct vocabulary, then call the pure/synchronous
 * `scoreMaxCosine` per job against the already-fetched, in-memory vector map. `getMaxCosineScores`
 * remains as a convenience one-shot wrapper (fetch + score in one call) for single-target call
 * sites.
 */

interface SkillVectorRow {
  skill: string;
  embedding: string;
}

/** Fetches `SkillEmbedding.embedding` for the given skill keys (any casing — normalized to
 * lowercase internally), scoped to `kind` (FR-03 isolation — the write path already scopes
 * inserts by kind; the read path must enforce the same partitioning, otherwise a skill string
 * canonicalized under the "wrong" kind is silently reused with no error/log signal), one batched
 * `SELECT ... WHERE skill IN (...) AND kind = $N` query. Skills with no cached vector yet
 * (not-yet-backfilled) — or whose only cached vector is under a different kind — are simply
 * absent from the returned map. */
export async function fetchSkillVectors(
  skills: string[],
  kind: SkillKind,
): Promise<Map<string, number[]>> {
  const vectors = new Map<string, number[]>();
  if (skills.length === 0) return vectors;

  const distinct = Array.from(new Set(skills.map((s) => s.toLowerCase())));
  const placeholders = distinct.map((_, i) => `$${i + 1}`).join(", ");
  const kindParam = `$${distinct.length + 1}`;
  const rows = await prisma.$queryRawUnsafe<SkillVectorRow[]>(
    `SELECT skill, embedding::text as embedding FROM "SkillEmbedding" WHERE skill IN (${placeholders}) AND kind = ${kindParam}::"SkillKind"`,
    ...distinct,
    kind,
  );

  for (const row of rows) {
    vectors.set(row.skill, JSON.parse(row.embedding) as number[]);
  }
  return vectors;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface MaxCosineResult {
  /** Average max-cosine across all targets (0-100) — the sub-score composite dimension value. */
  score: number;
  /** Per-target max-cosine (0-100), keyed by the original (as-passed, non-lowercased) target
   * string — consumed by `matchScorer.computeMatchScore` for FR-17's threshold-based
   * matched/missing classification. */
  itemScores: Record<string, number>;
}

/**
 * Pure, synchronous, in-memory `max-cosine` scoring — no I/O — given an already-fetched
 * `vectors` map (from `fetchSkillVectors`). For each target, the best (highest) cosine
 * similarity against any profile skill vector, then averaged across targets.
 *
 * Returns `{ score: 100, itemScores: {} }` when `targets` is empty (mirrors `computeOverlap`'s
 * former empty-target convention — nothing was requested, so there's nothing to be missing). A
 * target or profile skill with no cached vector (not-yet-backfilled, spectech.md Migration &
 * Rollback) degrades to `max-cosine = 0` for that item rather than erroring.
 */
export function scoreMaxCosine(
  targets: string[],
  profileVectorKeys: string[],
  vectors: Map<string, number[]>,
): MaxCosineResult {
  if (targets.length === 0) return { score: 100, itemScores: {} };

  const profileVectors = profileVectorKeys
    .map((skill) => vectors.get(skill.toLowerCase()))
    .filter((v): v is number[] => v !== undefined);

  const itemScores: Record<string, number> = {};

  if (profileVectors.length === 0) {
    // No comparable profile vectors at all — every target degrades to 0 (graceful degrade).
    for (const target of targets) itemScores[target] = 0;
    return { score: 0, itemScores };
  }

  const perTargetScores = targets.map((target) => {
    const targetVector = vectors.get(target.toLowerCase());
    let itemScore = 0;
    if (targetVector) {
      const best = Math.max(
        ...profileVectors.map((profileVector) =>
          cosineSimilarity(targetVector, profileVector),
        ),
      );
      itemScore = Math.round(Math.max(0, best) * 100);
    } // else: not-yet-backfilled skill — graceful degrade, itemScore stays 0
    itemScores[target] = itemScore;
    return itemScore;
  });

  const average =
    perTargetScores.reduce((sum, s) => sum + s, 0) / perTargetScores.length;
  return { score: Math.round(average), itemScores };
}

/**
 * Convenience one-shot wrapper: fetches vectors for exactly `targets` + `profileVectorKeys`
 * (one batched query) and scores them. Suitable for a single ad-hoc call site; a caller scoring
 * many jobs in one request (e.g. the Stage-1 pool in `jobs/route.ts`) should call
 * `fetchSkillVectors` once for the pool's full vocabulary and `scoreMaxCosine` per job instead,
 * to keep the whole request at one batched query total.
 */
export async function getMaxCosineScores(
  targets: string[],
  profileVectorKeys: string[],
  kind: SkillKind,
): Promise<MaxCosineResult> {
  if (targets.length === 0) return { score: 100, itemScores: {} };

  const vectors = await fetchSkillVectors(
    [...targets, ...profileVectorKeys],
    kind,
  );
  return scoreMaxCosine(targets, profileVectorKeys, vectors);
}
