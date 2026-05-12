// Job listing and search validation schemas
import { z } from 'zod';
import {
  uuidSchema,
  textSchema,
  dateSchema,
  paginationSchema,
  urlSchema,
} from './common';

// Job source enum (Aligned with Prisma PortalType)
export const jobSourceSchema = z.enum([
  'WEREMOTE',
  'LINKEDIN',
  'INDEED',
  'GLASSDOOR',
  'CUSTOM',
]);

// Weighted item schema (for titles and skills)
export const weightedItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  weight: z.number().min(0).max(5).default(1),
});

// Job search query (for saved searches and active funnel)
export const jobSearchQuerySchema = z.object({
  id: uuidSchema.optional(),
  title: textSchema(1, 100), // Name of the profile
  keywords: z.array(z.string()).min(1, "At least one keyword is required"),
  
  // Weighted Profile
  targetTitles: z.array(weightedItemSchema).optional().default([]),
  hardSkills: z.array(weightedItemSchema).optional().default([]),
  softSkills: z.array(weightedItemSchema).optional().default([]),

  // Filters
  remoteOnly: z.boolean().default(true),
  salaryMin: z.number().int().min(0).optional().nullable(),
  salaryMax: z.number().int().min(0).optional().nullable(),
  locations: z.array(z.string()).optional().default([]),
  
  // Settings
  portalIds: z.array(z.string()).optional().default([]),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MANUAL']).default('MANUAL'),
  isActive: z.boolean().default(true),
});

export type JobSearchQueryInput = z.infer<typeof jobSearchQuerySchema>;

// Application status enum
export const applicationStatusSchema = z.enum([
  'SAVED',
  'APPLIED',
  'INTERVIEWING',
  'OFFERED',
  'REJECTED',
  'WITHDRAWN',
]);

// Job application
export const jobApplicationSchema = z.object({
  id: uuidSchema.optional(),
  jobId: uuidSchema,
  userId: uuidSchema,
  status: applicationStatusSchema.default('SAVED'),
  appliedAt: dateSchema.optional().nullable(),
  coverLetterId: uuidSchema.optional().nullable(),
  notes: textSchema(0, 2000).optional().or(z.literal('')),
  nextSteps: z.string().max(500).optional().or(z.literal('')),
  followUpDate: dateSchema.optional().nullable(),
});

export type JobApplicationInput = z.infer<typeof jobApplicationSchema>;

// Status change history
export const statusChangeSchema = z.object({
  id: uuidSchema.optional(),
  applicationId: uuidSchema,
  fromStatus: applicationStatusSchema,
  toStatus: applicationStatusSchema,
  changedAt: dateSchema,
  changedBy: z.enum(['USER', 'SYSTEM', 'API']).default('USER'),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export type StatusChangeInput = z.infer<typeof statusChangeSchema>;
