// Job listing and search validation schemas
import { z } from 'zod';
import {
  uuidSchema,
  textSchema,
  dateSchema,
  paginationSchema,
  urlSchema,
} from './common';

// Job source enum
export const jobSourceSchema = z.enum([
  'LINKEDIN',
  'INDEED',
  'GLASSDOOR',
  'REMOTIVE',
  'WEWORKREMOTELY',
  'OTHER',
]);

// Experience level enum
export const experienceLevelSchema = z.enum([
  'ENTRY',
  'MID',
  'SENIOR',
  'STAFF',
  'PRINCIPAL',
]);

// Employment type enum
export const employmentTypeSchema = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'FREELANCE',
  'INTERNSHIP',
]);

// Job listing validation
export const jobListingSchema = z.object({
  id: uuidSchema.optional(),
  title: textSchema(1, 200),
  company: textSchema(1, 100),
  location: z.enum(['REMOTE', 'HYBRID', 'ONSITE']).default('REMOTE'),
  description: textSchema(10, 10000),
  requirements: z.array(z.string().min(1)).min(1),
  salaryMin: z.number().int().min(0).optional().nullable(),
  salaryMax: z.number().int().min(0).optional().nullable(),
  salaryCurrency: z.string().length(3).default('USD'),
  employmentType: employmentTypeSchema.default('FULL_TIME'),
  experienceLevel: experienceLevelSchema.default('MID'),
  skills: z.array(z.string().min(1)).max(30),
  source: jobSourceSchema,
  sourceUrl: urlSchema,
  externalId: z.string().min(1).max(100).optional(),
  postedAt: dateSchema,
  expiresAt: dateSchema.optional().nullable(),
  isActive: z.boolean().default(true),
});

export type JobListingInput = z.infer<typeof jobListingSchema>;

// Job match score
export const jobMatchSchema = z.object({
  id: uuidSchema.optional(),
  jobId: uuidSchema,
  userId: uuidSchema,
  compatibilityScore: z.number().min(0).max(100),
  skillMatchScore: z.number().min(0).max(100),
  experienceMatchScore: z.number().min(0).max(100),
  locationMatch: z.boolean(),
  salaryMatch: z.boolean(),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  isNotified: z.boolean().default(false),
  notificationSentAt: dateSchema.optional().nullable(),
});

export type JobMatchInput = z.infer<typeof jobMatchSchema>;

// Job search filters
export const jobSearchFiltersSchema = z.object({
  q: z.string().max(100).optional(),
  location: z.enum(['REMOTE', 'HYBRID', 'ONSITE', 'ANY']).default('ANY'),
  experienceLevel: experienceLevelSchema.optional(),
  employmentType: employmentTypeSchema.optional(),
  salaryMin: z.coerce.number().min(0).optional(),
  salaryMax: z.coerce.number().min(0).optional(),
  skills: z.array(z.string().min(1)).max(10).optional(),
  postedWithin: z.enum(['24h', '7d', '30d', 'all']).default('30d'),
  ...paginationSchema.shape,
});

export type JobSearchFiltersInput = z.infer<typeof jobSearchFiltersSchema>;

// Job search query (for saved searches)
export const jobSearchQuerySchema = z.object({
  id: uuidSchema.optional(),
  name: textSchema(1, 100),
  query: z.string().max(200).optional(),
  filters: jobSearchFiltersSchema.omit({ page: true, limit: true }),
  frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'NEVER']).default('WEEKLY'),
  isActive: z.boolean().default(true),
  lastRunAt: dateSchema.optional().nullable(),
  nextRunAt: dateSchema.optional().nullable(),
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
