import { generateJSON } from "../lib/ai/aiClient";
import { logger } from "../lib/logging/logger";

// ── Input types ──────────────────────────────────────────────
export interface BulletInput {
  id: string;
  text: string;
  type: "BULLET" | "PARAGRAPH";
  usedInCVs: Array<{ id: string; name: string }>;
}

export interface ReviewAllInput {
  bullets: BulletInput[];
  contextNotes: string[]; // freeFormContext array
}

export interface GenerateBulletInput {
  contextNotes: string[]; // must be non-empty (guard at route level)
  existingBullets: string[]; // texts of existing bullets for deduplication context
  userComment?: string; // optional steering comment from the Regenerate flow
}

export interface ReviewBulletInput {
  bullet: BulletInput;
  contextNotes: string[];
  userComment?: string; // optional steering comment from the Regenerate flow
}

// ── Output types (AI response shape) ──────────────────────────
export type SuggestionType = "REWRITE" | "MERGE" | "NEW";

export interface RewriteSuggestion {
  type: "REWRITE";
  bulletId: string; // ID of the bullet being rewritten
  originalText: string;
  revisedText: string;
}

export interface MergeSuggestion {
  type: "MERGE";
  bulletIds: string[]; // IDs of source bullets to merge (2+)
  originalTexts: string[];
  combinedText: string;
}

export interface NewSuggestion {
  type: "NEW";
  text: string;
}

export type BulletSuggestion =
  | RewriteSuggestion
  | MergeSuggestion
  | NewSuggestion;

export interface ReviewAllResult {
  suggestions: BulletSuggestion[];
}

export interface SingleBulletResult {
  revisedText: string;
}

const REVIEW_ALL_SYSTEM_PROMPT = `You are a professional CV writing assistant specializing in ATS-optimized bullet points.

Analyze the provided list of CV bullet points and return a JSON object with a "suggestions" array.
Each suggestion must be one of:
- { "type": "REWRITE", "bulletId": "<id>", "originalText": "...", "revisedText": "..." }
- { "type": "MERGE", "bulletIds": ["<id1>", "<id2>"], "originalTexts": ["...", "..."], "combinedText": "..." }
- { "type": "NEW", "text": "..." }

Rules:
- Only suggest REWRITE when the existing text has clear improvement potential (clarity, keywords, metrics)
- Only suggest MERGE when 2-3 bullets are semantically redundant and can be combined without losing specificity
- Only suggest NEW bullets when AI Context Notes are present and contain information not reflected in existing bullets
- Do not suggest changes for well-written bullets — omit them from suggestions
- Preserve all referenced bullet IDs exactly as provided
- Return ONLY valid JSON, no markdown, no commentary`;

const GENERATE_BULLET_SYSTEM_PROMPT = `You are a professional CV writing assistant specializing in ATS-optimized bullet points.
Generate ONE new bullet point for a CV based on the provided context notes.
The bullet must be action-verb led, quantified where possible, and relevant to the existing bullet style.
Return: { "revisedText": "<the new bullet text>" }`;

const REVIEW_BULLET_SYSTEM_PROMPT = `You are a professional CV writing assistant specializing in ATS-optimized bullet points.
Review and improve the provided single bullet point.
[If context notes are present]: Use the context notes to enrich the bullet with specific data, metrics, or skills not currently mentioned.
[If context notes are absent]: Focus on clarity, active voice, and ATS keyword optimization.
Return: { "revisedText": "<the improved bullet text>" }`;

/**
 * Analyzes a full list of CV bullets and returns REWRITE/MERGE/NEW suggestions.
 */
export async function runReviewAll(
  input: ReviewAllInput,
): Promise<ReviewAllResult> {
  logger.info("[ProfileBulletAIService] Starting review-all", {
    bulletCount: input.bullets.length,
    hasContextNotes: input.contextNotes.length > 0,
  });

  const userPrompt = buildReviewAllPrompt(input);
  const result = await generateJSON<ReviewAllResult>(
    userPrompt,
    "profile",
    REVIEW_ALL_SYSTEM_PROMPT,
  );

  const suggestions = Array.isArray(result.suggestions)
    ? result.suggestions
    : [];

  logger.info("[ProfileBulletAIService] Completed review-all", {
    suggestionCount: suggestions.length,
  });

  return { suggestions };
}

/**
 * Generates one new bullet point from the entity's context notes.
 */
export async function runGenerateBullet(
  input: GenerateBulletInput,
): Promise<SingleBulletResult> {
  logger.info("[ProfileBulletAIService] Starting generate-bullet", {
    contextNoteCount: input.contextNotes.length,
  });

  const userPrompt = buildGenerateBulletPrompt(input);
  const result = await generateJSON<SingleBulletResult>(
    userPrompt,
    "profile",
    GENERATE_BULLET_SYSTEM_PROMPT,
  );

  return {
    revisedText:
      typeof result.revisedText === "string" ? result.revisedText : "",
  };
}

/**
 * Reviews and improves a single existing bullet point.
 */
export async function runReviewBullet(
  input: ReviewBulletInput,
): Promise<SingleBulletResult> {
  logger.info("[ProfileBulletAIService] Starting review-bullet", {
    bulletId: input.bullet.id,
    hasContextNotes: input.contextNotes.length > 0,
  });

  const userPrompt = buildReviewBulletPrompt(input);
  const result = await generateJSON<SingleBulletResult>(
    userPrompt,
    "profile",
    REVIEW_BULLET_SYSTEM_PROMPT,
  );

  return {
    revisedText:
      typeof result.revisedText === "string" ? result.revisedText : "",
  };
}

function buildReviewAllPrompt(input: ReviewAllInput): string {
  const bulletsList = input.bullets
    .map((b) => `- id: ${b.id}, type: ${b.type}, text: "${b.text}"`)
    .join("\n");

  const contextNotesSection =
    input.contextNotes.length > 0
      ? `AI Context Notes:\n${input.contextNotes.map((n) => `- ${n}`).join("\n")}`
      : "AI Context Notes: None provided.";

  return `Bullets:\n${bulletsList}\n\n${contextNotesSection}`;
}

function buildGenerateBulletPrompt(input: GenerateBulletInput): string {
  const contextNotesSection = input.contextNotes
    .map((n) => `- ${n}`)
    .join("\n");
  const existingBulletsSection =
    input.existingBullets.length > 0
      ? input.existingBullets.map((t) => `- ${t}`).join("\n")
      : "None";

  const commentSection = input.userComment?.trim()
    ? `\n\nUser Comment (apply this feedback): ${input.userComment.trim()}`
    : "";

  return `AI Context Notes:\n${contextNotesSection}\n\nExisting Bullets (avoid duplicating):\n${existingBulletsSection}${commentSection}`;
}

function buildReviewBulletPrompt(input: ReviewBulletInput): string {
  const contextNotesSection =
    input.contextNotes.length > 0
      ? `AI Context Notes:\n${input.contextNotes.map((n) => `- ${n}`).join("\n")}`
      : "AI Context Notes: None provided.";

  const commentSection = input.userComment?.trim()
    ? `\n\nUser Comment (apply this feedback): ${input.userComment.trim()}`
    : "";

  return `Bullet to review:\n"${input.bullet.text}"\n\n${contextNotesSection}${commentSection}`;
}
