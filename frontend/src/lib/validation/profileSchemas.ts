import { z } from "zod";

export const BulletInputSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1, "Bullet text cannot be empty"),
  isActive: z.boolean().default(true),
  isArchived: z.boolean().default(false),
  type: z.enum(["BULLET", "PARAGRAPH"]).default("BULLET"),
  sortOrder: z.number().int().default(0),
});

export const BasicDataInputSchema = z.object({
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  linkedin: z.string().url("Invalid LinkedIn URL").or(z.literal("")).nullable().optional(),
  github: z.string().url("Invalid GitHub URL").or(z.literal("")).nullable().optional(),
  website: z.string().url("Invalid website URL").or(z.literal("")).nullable().optional(),
  title: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
});

export const ExperienceInputSchema = z.object({
  company: z.string().min(1, "Company name is required"),
  position: z.string().min(1, "Position is required"),
  startDate: z.string().datetime({ message: "Start date must be a valid ISO datetime string" }),
  endDate: z.string().datetime({ message: "End date must be a valid ISO datetime string" }).nullable().optional(),
  current: z.boolean().default(false),
  bullets: z.array(BulletInputSchema).default([]),
  freeFormContext: z.string().nullable().optional(),
});

export const EducationInputSchema = z.object({
  institution: z.string().min(1, "Institution name is required"),
  degree: z.string().min(1, "Degree is required"),
  fieldOfStudy: z.string().nullable().optional(),
  startDate: z.string().datetime({ message: "Start date must be a valid ISO datetime string" }),
  endDate: z.string().datetime({ message: "End date must be a valid ISO datetime string" }).nullable().optional(),
  current: z.boolean().default(false),
  hideEndDate: z.boolean().default(false),
  bullets: z.array(BulletInputSchema).default([]),
  freeFormContext: z.string().nullable().optional(),
});

export const ProjectInputSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  startDate: z.string().datetime({ message: "Start date must be a valid ISO datetime string" }).nullable().optional(),
  endDate: z.string().datetime({ message: "End date must be a valid ISO datetime string" }).nullable().optional(),
  current: z.boolean().default(false),
  technologies: z.array(z.string()).default([]),
  bullets: z.array(BulletInputSchema).default([]),
  freeFormContext: z.string().nullable().optional(),
});

export const SkillInputSchema = z.object({
  name: z.string().min(1, "Skill name is required"),
  proficiency: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]),
  yearsExperience: z.number().int().nonnegative().nullable().optional(),
});

export const ReferenceInputSchema = z.object({
  name: z.string().min(1, "Reference name is required"),
  company: z.string().nullable().optional(),
  relationship: z.string().nullable().optional(),
  email: z.string().email("Invalid email address").or(z.literal("")).nullable().optional(),
  phone: z.string().nullable().optional(),
  canContact: z.boolean().default(false),
});
