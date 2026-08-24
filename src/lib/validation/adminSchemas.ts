import { z } from "zod";

export const llmConfigSchema = z.object({
  defaultProvider: z.enum(["ollama", "gemini", "claude"], {
    message: "Must be one of: ollama, gemini, claude",
  }),
  parsingProvider: z.enum(["ollama", "gemini", "claude"], {
    message: "Must be one of: ollama, gemini, claude",
  }),
  summariesProvider: z.enum(["ollama", "gemini", "claude"], {
    message: "Must be one of: ollama, gemini, claude",
  }),
  profileProvider: z.enum(["ollama", "gemini", "claude"], {
    message: "Must be one of: ollama, gemini, claude",
  }),
  embeddingProvider: z.enum(["ollama", "gemini"], {
    message: "Must be one of: ollama, gemini",
  }),
});

export type LLMConfigSchemaInput = z.infer<typeof llmConfigSchema>;

export const skillThresholdSchema = z.object({
  threshold: z.number().int().min(0).max(100),
});

export type SkillThresholdSchemaInput = z.infer<typeof skillThresholdSchema>;
