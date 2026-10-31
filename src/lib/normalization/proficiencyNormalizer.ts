import { ProficiencyLevel } from "@/types/profile";
import { logger } from "@/lib/logging/logger";

export const DEFAULT_FALLBACK_PROFICIENCY: ProficiencyLevel = "INTERMEDIATE";

export const CANONICAL_PROFICIENCY_LEVELS: ReadonlySet<ProficiencyLevel> =
  new Set<ProficiencyLevel>(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]);

const RAW_PROFICIENCY_MAX_LOG_LENGTH = 100;

function truncateForLog(raw?: unknown): unknown {
  if (typeof raw === "string" && raw.length > RAW_PROFICIENCY_MAX_LOG_LENGTH) {
    return raw.slice(0, RAW_PROFICIENCY_MAX_LOG_LENGTH) + "...";
  }
  return raw;
}

export const PROFICIENCY_DICTIONARY: Readonly<
  Record<string, ProficiencyLevel>
> = Object.freeze(
  Object.assign(Object.create(null), {
    // Beginner synonyms
    basic: "BEGINNER",
    beginner: "BEGINNER",
    novice: "BEGINNER",
    iniciante: "BEGINNER",
    básico: "BEGINNER",
    basico: "BEGINNER",
    elementary: "BEGINNER",

    // Intermediate synonyms
    conversational: "INTERMEDIATE",
    intermediate: "INTERMEDIATE",
    intermediated: "INTERMEDIATE",
    intermédio: "INTERMEDIATE",
    intermedio: "INTERMEDIATE",
    médio: "INTERMEDIATE",
    medio: "INTERMEDIATE",

    // Advanced synonyms
    fluent: "ADVANCED",
    advanced: "ADVANCED",
    proficient: "ADVANCED",
    avançado: "ADVANCED",
    avancado: "ADVANCED",
    fluente: "ADVANCED",

    // Expert synonyms
    native: "EXPERT",
    expert: "EXPERT",
    master: "EXPERT",
    nativo: "EXPERT",
    bilingual: "EXPERT",
  }),
);

/**
 * Normalizes any raw proficiency string into one of the canonical PostgreSQL enum values:
 * BEGINNER | INTERMEDIATE | ADVANCED | EXPERT.
 *
 * Falls back safely to DEFAULT_FALLBACK_PROFICIENCY (INTERMEDIATE) for null, undefined,
 * empty strings, whitespace, or unrecognized terms, preventing Prisma validation errors.
 *
 * Emits structured, PII-safe warning logs for mapped synonyms or fallback triggers.
 */
export function normalizeProficiency(
  raw?: string | null,
  skillName?: string,
): ProficiencyLevel {
  // 1. Input Inspection
  if (raw === null || raw === undefined || typeof raw !== "string") {
    logger.warn("Missing or empty proficiency level, falling back to default", {
      action: "normalize_proficiency",
      skillName,
      rawProficiency: truncateForLog(raw),
      normalizedProficiency: DEFAULT_FALLBACK_PROFICIENCY,
      reason: "fallback_empty",
    });
    return DEFAULT_FALLBACK_PROFICIENCY;
  }

  // 2. Sanitization
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    logger.warn("Missing or empty proficiency level, falling back to default", {
      action: "normalize_proficiency",
      skillName,
      rawProficiency: truncateForLog(raw),
      normalizedProficiency: DEFAULT_FALLBACK_PROFICIENCY,
      reason: "fallback_empty",
    });
    return DEFAULT_FALLBACK_PROFICIENCY;
  }

  // 3. Fast-Path Canonical Enum Check (case-insensitive for exact canonical names)
  const upperTrimmed = trimmed.toUpperCase() as ProficiencyLevel;
  if (CANONICAL_PROFICIENCY_LEVELS.has(upperTrimmed)) {
    return upperTrimmed;
  }

  // 4. Dictionary Lookup (safe check to avoid inherited prototype properties)
  const normalizedKey = trimmed.toLowerCase();
  const mappedLevel = Object.prototype.hasOwnProperty.call(
    PROFICIENCY_DICTIONARY,
    normalizedKey,
  )
    ? PROFICIENCY_DICTIONARY[normalizedKey]
    : undefined;

  if (mappedLevel) {
    logger.warn("Normalized non-standard proficiency level to canonical enum", {
      action: "normalize_proficiency",
      skillName,
      rawProficiency: truncateForLog(raw),
      normalizedProficiency: mappedLevel,
      reason: "mapped",
    });
    return mappedLevel;
  }

  // 5. Unrecognized Term Fallback
  logger.warn("Unrecognized proficiency level, falling back to default", {
    action: "normalize_proficiency",
    skillName,
    rawProficiency: truncateForLog(raw),
    normalizedProficiency: DEFAULT_FALLBACK_PROFICIENCY,
    reason: "fallback_unrecognized",
  });
  return DEFAULT_FALLBACK_PROFICIENCY;
}
