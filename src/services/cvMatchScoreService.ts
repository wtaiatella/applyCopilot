import { prisma } from "@/lib/db/prisma";
import { generateEmbedding } from "@/lib/ai/vector-service";
import { logger } from "@/lib/logging/logger";
import type { CVSnapshotData } from "@/types/cv";

/**
 * Owns CV-scoped text consolidation + embedding + cosine-similarity lookup (FR-13, AC.8).
 * Reuses `vector-service.ts`'s `generateEmbedding` as-is and the same `pgvector` `<=>`
 * cosine-distance raw-query pattern already used by `job-query.ts`'s
 * `getJobsWithSimilarity` (Profile↔JobListing matching, `deepAnalysisService.ts`'s era) —
 * scoped here to a single `jobId` instead of ranking a list.
 */

/**
 * Deterministically consolidates a CV snapshot's `included: true` content into a single text
 * document for embedding — mirrors `profileSyncService.consolidateProfileToText`'s shape, but
 * only over what would actually be exported to the CV (FR-13: only included content is scored).
 */
export function consolidateSnapshotToText(snapshot: CVSnapshotData): string {
  const parts: string[] = [];

  if (snapshot.basicData.title) {
    parts.push(`Professional Title: ${snapshot.basicData.title}`);
  }

  const includedSummary = snapshot.summaries.find((s) => s.included);
  if (includedSummary) {
    parts.push(`Professional Summary: ${includedSummary.content}`);
  }

  const includedSkills = snapshot.skills.filter((s) => s.included);
  if (includedSkills.length > 0) {
    parts.push("\nCore Skills & Technologies:");
    includedSkills.forEach((s) => {
      const exp = s.yearsExperience ? ` (${s.yearsExperience} years exp)` : "";
      parts.push(`- ${s.name}: Level ${s.proficiency}${exp}`);
    });
  }

  if (snapshot.experiences.length > 0) {
    parts.push("\nProfessional Experience:");
    snapshot.experiences.forEach((exp) => {
      parts.push(`- ${exp.position} at ${exp.company}:`);
      exp.bullets
        .filter((b) => b.included)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .forEach((bullet) => {
          parts.push(`  * ${bullet.text}`);
        });
    });
  }

  if (snapshot.education.length > 0) {
    parts.push("\nEducation & Training:");
    snapshot.education.forEach((edu) => {
      const field = edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : "";
      parts.push(`- ${edu.degree}${field} at ${edu.institution}`);
      edu.bullets
        .filter((b) => b.included)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .forEach((bullet) => {
          parts.push(`  * ${bullet.text}`);
        });
    });
  }

  if (snapshot.projects.length > 0) {
    parts.push("\nKey Projects:");
    snapshot.projects.forEach((proj) => {
      const tech =
        proj.technologies.length > 0
          ? ` (Technologies: ${proj.technologies.join(", ")})`
          : "";
      parts.push(`- Project: ${proj.name}${tech}`);
      proj.bullets
        .filter((b) => b.included)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .forEach((bullet) => {
          parts.push(`  * ${bullet.text}`);
        });
    });
  }

  return parts.join("\n").trim();
}

interface JobEmbeddingRow {
  matchScore: number | null;
}

/**
 * Computes an on-demand match score (0-100) between a CV's `included` content and a job's
 * cached embedding, via the same `pgvector` cosine-distance query shape as
 * `job-query.ts`'s `getJobsWithSimilarity`, scoped to one `jobId`.
 *
 * Returns `0` if the job has no cached embedding yet (classification not yet completed) —
 * this is a best-effort score, not an error condition.
 */
export async function calculateCVMatchScore(
  snapshot: CVSnapshotData,
  jobId: string,
): Promise<number> {
  const consolidatedText = consolidateSnapshotToText(snapshot);
  const embedding = await generateEmbedding(consolidatedText);
  const vectorStr = `[${embedding.join(",")}]`;

  const rows = await prisma.$queryRawUnsafe<JobEmbeddingRow[]>(
    `
    SELECT ((1 - (embedding <=> $1::vector)) * 100) as "matchScore"
    FROM "JobListing"
    WHERE id = $2 AND embedding IS NOT NULL;
    `,
    vectorStr,
    jobId,
  );

  const matchScore = rows[0]?.matchScore;
  if (matchScore === null || matchScore === undefined) {
    logger.warn("cv_match_score_no_job_embedding", { jobId });
    return 0;
  }

  return matchScore;
}
