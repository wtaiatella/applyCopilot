import { z } from "zod";

export const AISdkTypeSchema = z.enum([
  "GOOGLE_GENAI",
  "OPENAI_COMPATIBLE",
  "OLLAMA",
]);

export const AITierSchema = z.enum(["FREE", "LOCAL"]);

export const AIRouteIdSchema = z.enum([
  "cv.parse.basicData",
  "cv.parse.experiences",
  "cv.parse.projects",
  "cv.parse.education",
  "cv.parse.skills",
  "jobs.classification",
  "jobs.deepAnalysis",
  "profile.summaryGenerate",
  "profile.bulletReviewAll",
  "profile.bulletImprove",
  "profile.bulletGenerate",
  "profile.summaryAI",
  "profile.syncFacts",
  "profile.skillAlias",
  "profile.projectSuggest",
  "profile.skillsSuggest",
]);

export const CreateAIProviderSchema = z.object({
  name: z.string().min(1, "Provider name is required").max(100),
  sdkType: AISdkTypeSchema,
  apiKeyEnvVar: z.string().max(100).nullable().optional(),
  baseUrl: z.string().url("Must be a valid URL").nullable().optional(),
});

export const CreateAIModelSchema = z.object({
  providerId: z.string().min(1, "Provider ID is required"),
  displayName: z.string().min(1, "Display name is required").max(100),
  modelId: z.string().min(1, "Model ID is required").max(100),
  tier: AITierSchema.default("FREE"),
  rpm: z.number().int().min(1).default(15),
  rpd: z.number().int().min(1).default(500),
  tpm: z.number().int().min(1).default(250000),
  tpd: z.number().int().min(1).default(1000000),
  safetyMargin: z.number().min(0.1).max(1.0).default(0.90),
  isEnabled: z.boolean().default(true),
});

export const UpdateAIModelSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  modelId: z.string().min(1).max(100).optional(),
  tier: AITierSchema.optional(),
  rpm: z.number().int().min(1).optional(),
  rpd: z.number().int().min(1).optional(),
  tpm: z.number().int().min(1).optional(),
  tpd: z.number().int().min(1).optional(),
  safetyMargin: z.number().min(0.1).max(1.0).optional(),
  isEnabled: z.boolean().optional(),
});

export const UpdateAIRoutePreferenceSchema = z.object({
  routes: z.array(
    z.object({
      routeId: AIRouteIdSchema,
      preferredTier: AITierSchema,
    }),
  ),
});
