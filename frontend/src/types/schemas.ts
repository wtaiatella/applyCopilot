import { z } from 'zod'

// Base schemas
export const BaseSchema = z.object({
  id: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

// User schemas
export const UserSchema = BaseSchema.extend({
  email: z.string().email(),
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  password_hash: z.string().optional(),
})

export const UserRegisterSchema = UserSchema.pick({
  email: true,
  full_name: true,
}).extend({
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

export const UserLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
})

// Profile schemas
export const ProfileSchema = BaseSchema.extend({
  phone: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  linkedin_url: z.string().url().optional().or(z.literal('')),
  github_url: z.string().url().optional().or(z.literal('')),
  portfolio_url: z.string().url().optional().or(z.literal('')),
  current_position: z.string().optional(),
  summary: z.string().optional(),
  skills: z.record(z.string(), z.any()).optional(),
  contract_types: z.array(z.string()).optional(),
  work_modality: z.array(z.string()).optional(),
  salary_range: z.record(z.string(), z.number()).optional(),
  locations_of_interest: z.array(z.string()).optional(),
  technologies_of_interest: z.array(z.string()).optional(),
  user_id: z.string(),
})

// Education schemas
export const EducationSchema = BaseSchema.extend({
  institution: z.string().min(1, 'Institution is required'),
  degree: z.string().min(1, 'Degree is required'),
  field_of_study: z.string().min(1, 'Field of study is required'),
  start_date: z.string(),
  end_date: z.string().optional(),
  description: z.string().optional(),
  technologies: z.array(z.string()).optional(),
  personal_comments: z.string().optional(),
  profile_id: z.string(),
})

// Experience schemas
export const ExperienceSchema = BaseSchema.extend({
  company: z.string().min(1, 'Company is required'),
  position: z.string().min(1, 'Position is required'),
  start_date: z.string(),
  end_date: z.string().optional(),
  is_current: z.boolean().default(false),
  company_description: z.string().min(1, 'Company description is required'),
  alternative_descriptions: z.array(z.record(z.string(), z.any())).optional(),
  achievements: z.array(z.record(z.string(), z.any())).optional(),
  technologies: z.array(z.string()).optional(),
  personal_comments: z.string().optional(),
  profile_id: z.string(),
})

// Project schemas
export const ProjectSchema = BaseSchema.extend({
  name: z.string().min(1, 'Project name is required'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  url: z.string().url().optional().or(z.literal('')),
  github_url: z.string().url().optional().or(z.literal('')),
  description: z.string().min(1, 'Description is required'),
  alternative_descriptions: z.array(z.record(z.string(), z.any())).optional(),
  highlights: z.array(z.record(z.string(), z.any())).optional(),
  technologies: z.array(z.string()).optional(),
  personal_comments: z.string().optional(),
  profile_id: z.string(),
})

// Job schemas (for future phases)
export const JobSchema = BaseSchema.extend({
  title: z.string().min(1, 'Title is required'),
  company: z.string().min(1, 'Company is required'),
  company_url: z.string().url().optional().or(z.literal('')),
  company_location: z.string().optional(),
  job_location: z.string().optional(),
  job_type: z.string().optional(),
  salary: z.string().optional(),
  is_worldwide: z.boolean().optional(),
  job_description_url: z.string().url(),
  description: z.string().optional(),
  raw_markdown: z.string().optional(),
  status: z.string().default('discovered'),
  user_id: z.string().optional(),
})

// Type exports
export type User = z.infer<typeof UserSchema>
export type UserRegister = z.infer<typeof UserRegisterSchema>
export type UserLogin = z.infer<typeof UserLoginSchema>
export type Profile = z.infer<typeof ProfileSchema>
export type Education = z.infer<typeof EducationSchema>
export type Experience = z.infer<typeof ExperienceSchema>
export type Project = z.infer<typeof ProjectSchema>
export type Job = z.infer<typeof JobSchema>
