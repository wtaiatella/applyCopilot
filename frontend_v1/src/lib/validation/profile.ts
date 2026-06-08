// Profile and CV-related validation schemas
import { z } from 'zod';
import {
  uuidSchema,
  nameSchema,
  textSchema,
  dateSchema,
  optionalDateSchema,
  bulletPointsSchema,
  aiSuggestionsSchema,
  stringArraySchema,
} from './common';
import { userBasicDataSchema } from './user';

// Profile summary
export const profileSummarySchema = z.object({
  id: uuidSchema.optional(), // Optional for creation
  title: nameSchema,
  content: textSchema(50, 2000),
  isAIGenerated: z.boolean().default(false),
  isActive: z.boolean().default(false),
});

export type ProfileSummaryInput = z.infer<typeof profileSummarySchema>;

// Relational/Structured Bullet Point Object schema
export const bulletPointObjectSchema = z.object({
  id: uuidSchema.optional(),
  text: z.string().min(1).max(1000),
  isActive: z.boolean().default(true),
  isArchived: z.boolean().default(false),
  type: z.enum(['bullet', 'paragraph']).default('bullet'),
  cvIds: z.array(uuidSchema).default([]),
});

export type BulletPointObjectInput = z.infer<typeof bulletPointObjectSchema>;

// Flexible bullet points array supporting strings (legacy) and objects (relational)
export const flexibleBulletPointsSchema = z.array(
  z.union([z.string().min(1).max(1000), bulletPointObjectSchema])
).max(100);

// Experience entry
export const experienceSchema = z.object({
  id: uuidSchema.optional(),
  company: nameSchema,
  position: nameSchema,
  startDate: dateSchema,
  endDate: optionalDateSchema,
  bulletPoints: flexibleBulletPointsSchema,
  freeFormContext: textSchema(0, 2000).optional().or(z.literal('')),
  aiSuggestions: aiSuggestionsSchema,
}).refine(
  (data) => {
    // End date must be after start date if provided
    if (data.endDate && data.startDate) {
      return new Date(data.endDate) > new Date(data.startDate);
    }
    return true;
  },
  {
    message: 'End date must be after start date',
    path: ['endDate'],
  }
);

export type ExperienceInput = z.infer<typeof experienceSchema>;

// Education entry
export const educationSchema = z.object({
  id: uuidSchema.optional(),
  institution: nameSchema,
  degree: nameSchema,
  field: nameSchema,
  startDate: dateSchema,
  endDate: optionalDateSchema,
  bulletPoints: bulletPointsSchema,
  freeFormContext: textSchema(0, 2000).optional().or(z.literal('')),
  aiSuggestions: aiSuggestionsSchema,
}).refine(
  (data) => {
    if (data.endDate && data.startDate) {
      return new Date(data.endDate) > new Date(data.startDate);
    }
    return true;
  },
  {
    message: 'End date must be after start date',
    path: ['endDate'],
  }
);

export type EducationInput = z.infer<typeof educationSchema>;

// Project entry
export const projectSchema = z.object({
  id: uuidSchema.optional(),
  name: nameSchema,
  description: textSchema(10, 1000),
  technologies: stringArraySchema,
  startDate: dateSchema,
  endDate: optionalDateSchema,
  bulletPoints: flexibleBulletPointsSchema,
  freeFormContext: textSchema(0, 2000).optional().or(z.literal('')),
  aiSuggestions: aiSuggestionsSchema,
}).refine(
  (data) => {
    if (data.endDate && data.startDate) {
      return new Date(data.endDate) > new Date(data.startDate);
    }
    return true;
  },
  {
    message: 'End date must be after start date',
    path: ['endDate'],
  }
);

export type ProjectInput = z.infer<typeof projectSchema>;

// Skill entry
export const skillSchema = z.object({
  id: uuidSchema.optional(),
  name: nameSchema,
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']).default('INTERMEDIATE'),
  yearsOfExperience: z.number().int().min(0).max(50).optional(),
  isVerified: z.boolean().default(false),
});

export type SkillInput = z.infer<typeof skillSchema>;

// Reference entry
export const referenceSchema = z.object({
  id: uuidSchema.optional(),
  name: nameSchema,
  relationship: nameSchema,
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  company: nameSchema.optional().or(z.literal('')),
  canContact: z.boolean().default(false),
  notes: textSchema(0, 1000).optional().or(z.literal('')),
});

export type ReferenceInput = z.infer<typeof referenceSchema>;

// Complete profile update
export const profileUpdateSchema = z.object({
  basicData: userBasicDataSchema,
  summaries: z.array(profileSummarySchema).max(5).optional(),
  experiences: z.array(experienceSchema).max(20).optional(),
  education: z.array(educationSchema).max(10).optional(),
  projects: z.array(projectSchema).max(15).optional(),
  skills: z.array(skillSchema).max(50).optional(),
  references: z.array(referenceSchema).max(5).optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// CV upload response validation
// Note: id fields are already optional in schemas, so .omit() is not needed
export const cvUploadResponseSchema = z.object({
  success: z.boolean(),
  profileId: uuidSchema.optional(),
  extractedData: z.object({
    basicData: userBasicDataSchema,
    experiences: z.array(experienceSchema),
    education: z.array(educationSchema),
    projects: z.array(projectSchema),
    skills: z.array(skillSchema),
    references: z.array(referenceSchema),
  }).optional(),
  error: z.string().optional(),
});

export type CVUploadResponse = z.infer<typeof cvUploadResponseSchema>;
