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
});

export type LLMConfigSchemaInput = z.infer<typeof llmConfigSchema>;
