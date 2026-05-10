// Common validation schemas and utilities
import { z } from 'zod';

// ID validation (Supports both UUID and MongoDB ObjectId)
export const uuidSchema = z.string().refine(
  (val) => /^[0-9a-fA-F]{24}$/.test(val) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(val),
  { message: 'Invalid ID format' }
);

// Email validation with stricter rules
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email address')
  .max(254, 'Email is too long');

// Password validation (matches security requirements)
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character');

// URL validation with safe protocols
export const urlSchema = z
  .string()
  .url('Invalid URL format')
  .refine(
    (url) => url.startsWith('http://') || url.startsWith('https://'),
    'URL must start with http:// or https://'
  )
  .max(2048, 'URL is too long');

// Phone number validation (flexible international format)
export const phoneSchema = z
  .string()
  .regex(
    /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/,
    'Invalid phone number format'
  )
  .min(7, 'Phone number is too short')
  .max(20, 'Phone number is too long')
  .optional()
  .or(z.literal(''));

// Date validation (ISO string)
export const dateSchema = z
  .string()
  .datetime('Invalid date format');

// Date or null (for optional dates like endDate)
export const optionalDateSchema = dateSchema.optional().nullable();

// Non-empty string with max length
export const nameSchema = z
  .string()
  .min(1, 'This field is required')
  .max(100, 'Name is too long');

// Text content with limits
export const textSchema = (min: number, max: number) =>
  z
    .string()
    .min(min, `Minimum ${min} characters required`)
    .max(max, `Maximum ${max} characters allowed`);

// Array of strings (e.g., skills, technologies)
export const stringArraySchema = z.array(z.string().min(1)).default([]);

// Bullet points array
export const bulletPointsSchema = z.array(z.string().min(1).max(500)).max(20);

// AI suggestions array
export const aiSuggestionsSchema = z.array(z.string()).default([]);

// Location string
export const locationSchema = z
  .string()
  .max(100, 'Location is too long')
  .optional()
  .or(z.literal(''));

// Portfolio links (array of URLs)
export const portfolioLinksSchema = z
  .array(urlSchema)
  .max(10, 'Maximum 10 portfolio links allowed')
  .default([]);

// Pagination params
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ID parameter for routes
export const idParamSchema = z.object({
  id: uuidSchema,
});

// Search/query params
export const searchSchema = z.object({
  q: z.string().min(1).max(100).optional(),
  ...paginationSchema.shape,
});

// File upload validation (for CV files)
export const cvFileSchema = z.object({
  file: z.instanceof(File).refine(
    (file) => {
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
      ];
      return allowedTypes.includes(file.type);
    },
    'Only PDF and DOCX files are allowed'
  ),
  size: z.number().max(10 * 1024 * 1024, 'File size must not exceed 10MB'),
});
