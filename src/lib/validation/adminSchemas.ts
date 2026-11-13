import { z } from "zod";

export const skillThresholdSchema = z.object({
  threshold: z.number().int().min(0).max(100),
});

export type SkillThresholdSchemaInput = z.infer<typeof skillThresholdSchema>;
