// User and authentication validation schemas
import { z } from 'zod';
import {
  emailSchema,
  passwordSchema,
  nameSchema,
  uuidSchema,
  phoneSchema,
  locationSchema,
  portfolioLinksSchema,
} from './common';

// User signup request
export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;

// User signin request
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type SignInInput = z.infer<typeof signInSchema>;

// Password reset request
export const passwordResetSchema = z.object({
  email: emailSchema,
});

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

// Password change (with current password)
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

// User basic data update
export const userBasicDataSchema = z.object({
  firstName: z.string().max(100).optional().or(z.literal('')),
  lastName: z.string().max(100).optional().or(z.literal('')),
  phone: phoneSchema,
  location: locationSchema,
  website: z.string().max(2048).optional().or(z.literal('')),
  github: z.string().max(2048).optional().or(z.literal('')),
  portfolioLinks: portfolioLinksSchema.optional(),
});

export type UserBasicDataInput = z.infer<typeof userBasicDataSchema>;

// User preferences
export const userPreferencesSchema = z.object({
  emailNotifications: z.boolean().default(true),
  whatsappNotifications: z.boolean().default(false),
  darkMode: z.boolean().default(true),
  language: z.enum(['en', 'pt', 'es']).default('en'),
});

export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;

// User response (for API responses)
export const userResponseSchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  name: nameSchema,
  avatar: z.string().url().optional().nullable(),
  emailVerified: z.date().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;
