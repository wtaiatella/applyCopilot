import { z } from "zod";

export const llmConfigSchema = z.object({
  defaultProvider: z.enum(
    ["ollama", "gemini", "claude", "gemma-26b", "gemma-31b"],
    { message: "Must be one of: ollama, gemini, claude, gemma-26b, gemma-31b" },
  ),
  parsingProvider: z.enum(
    ["ollama", "gemini", "claude", "gemma-26b", "gemma-31b"],
    { message: "Must be one of: ollama, gemini, claude, gemma-26b, gemma-31b" },
  ),
  summariesProvider: z.enum(
    ["ollama", "gemini", "claude", "gemma-26b", "gemma-31b"],
    { message: "Must be one of: ollama, gemini, claude, gemma-26b, gemma-31b" },
  ),
  profileProvider: z.enum(
    ["ollama", "gemini", "claude", "gemma-26b", "gemma-31b"],
    { message: "Must be one of: ollama, gemini, claude, gemma-26b, gemma-31b" },
  ),
  embeddingProvider: z.enum(["ollama", "gemini"], {
    message: "Must be one of: ollama, gemini",
  }),
});

export type LLMConfigSchemaInput = z.infer<typeof llmConfigSchema>;

export const skillThresholdSchema = z.object({
  threshold: z.number().int().min(0).max(100),
});

export type SkillThresholdSchemaInput = z.infer<typeof skillThresholdSchema>;
