// AI processing and generation validation schemas
import { z } from 'zod';
import { uuidSchema, textSchema } from './common';

// AI service provider enum
export const aiProviderSchema = z.enum(['OLLAMA', 'GEMINI', 'TENSORFLOW']);

// CV parsing request
export const cvParseRequestSchema = z.object({
  fileId: uuidSchema,
  fileUrl: z.string().url(),
  preferredProvider: aiProviderSchema.default('OLLAMA'),
});

export type CVParseRequestInput = z.infer<typeof cvParseRequestSchema>;

// Cover letter generation request
export const coverLetterRequestSchema = z.object({
  jobId: uuidSchema,
  userId: uuidSchema,
  tone: z.enum(['PROFESSIONAL', 'FRIENDLY', 'ENTHUSIASTIC', 'FORMAL']).default('PROFESSIONAL'),
  highlightExperience: z.boolean().default(true),
  customInstructions: textSchema(0, 500).optional().or(z.literal('')),
});

export type CoverLetterRequestInput = z.infer<typeof coverLetterRequestSchema>;

// Cover letter response
export const coverLetterSchema = z.object({
  id: uuidSchema.optional(),
  jobId: uuidSchema,
  userId: uuidSchema,
  content: textSchema(100, 5000),
  tone: z.enum(['PROFESSIONAL', 'FRIENDLY', 'ENTHUSIASTIC', 'FORMAL']),
  isAIGenerated: z.boolean().default(true),
  aiProvider: aiProviderSchema,
  tokensUsed: z.number().int().min(0).optional(),
  generatedAt: z.string().datetime(),
});

export type CoverLetterInput = z.infer<typeof coverLetterSchema>;

// CV suggestions request
export const cvSuggestionsRequestSchema = z.object({
  profileId: uuidSchema,
  targetJobTitle: textSchema(1, 100).optional(),
  targetIndustry: textSchema(1, 50).optional(),
});

export type CVSuggestionsRequestInput = z.infer<typeof cvSuggestionsRequestSchema>;

// CV suggestion item
export const cvSuggestionSchema = z.object({
  section: z.enum(['SUMMARY', 'EXPERIENCE', 'SKILLS', 'PROJECTS']),
  original: z.string(),
  suggestion: z.string(),
  reason: textSchema(10, 500),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
});

export type CVSuggestionInput = z.infer<typeof cvSuggestionSchema>;

// Job compatibility analysis request
export const compatibilityRequestSchema = z.object({
  jobId: uuidSchema,
  userId: uuidSchema,
  usePremiumAI: z.boolean().default(false),
});

export type CompatibilityRequestInput = z.infer<typeof compatibilityRequestSchema>;

// Compatibility analysis response
export const compatibilityAnalysisSchema = z.object({
  jobId: uuidSchema,
  userId: uuidSchema,
  overallScore: z.number().min(0).max(100),
  skillMatch: z.object({
    score: z.number().min(0).max(100),
    matched: z.array(z.string()),
    missing: z.array(z.string()),
    recommendations: z.array(z.string()),
  }),
  experienceMatch: z.object({
    score: z.number().min(0).max(100),
    yearsRequired: z.number().int().optional(),
    yearsUserHas: z.number().int().optional(),
    analysis: textSchema(0, 1000),
  }),
  summary: textSchema(50, 1000),
  generatedAt: z.string().datetime(),
  aiProvider: aiProviderSchema,
});

export type CompatibilityAnalysisInput = z.infer<typeof compatibilityAnalysisSchema>;

// AI processing status
export const aiProcessingStatusSchema = z.object({
  id: uuidSchema,
  type: z.enum(['CV_PARSE', 'COVER_LETTER', 'CV_SUGGESTIONS', 'COMPATIBILITY']),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
  progress: z.number().min(0).max(100).default(0),
  result: z.unknown().optional(),
  error: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AIProcessingStatusInput = z.infer<typeof aiProcessingStatusSchema>;

// Job data extraction (for scraping)
export const jobDataExtractionSchema = z.object({
  url: z.string().url(),
  html: z.string().min(1).max(500000),
  preferredProvider: aiProviderSchema.default('OLLAMA'),
});

export type JobDataExtractionInput = z.infer<typeof jobDataExtractionSchema>;
