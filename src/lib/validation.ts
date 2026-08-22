import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const profileSchema = z.object({
  name: z.string().min(2).max(50),
  birthdate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
  gender: z.enum(['male', 'female', 'non-binary', 'other']),
  interestedIn: z.enum(['male', 'female', 'everyone']),
  bio: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
});

export const preferencesSchema = z.object({
  minAge: z.number().int().min(18).max(99).default(18),
  maxAge: z.number().int().min(18).max(99).default(99),
  genders: z.enum(['male', 'female', 'all']).default('all'),
  maxDistance: z.number().int().positive().optional(),
  showMe: z.boolean().default(true),
});

export const swipeSchema = z.object({
  targetUserId: z.string().cuid(),
  type: z.enum(['LIKE', 'PASS', 'SUPER']),
});

export const messageSchema = z.object({
  content: z.string().min(1).max(2000),
});

export const reportSchema = z.object({
  reportedUserId: z.string().cuid(),
  reason: z.string().min(10).max(500),
});

export const blockSchema = z.object({
  blockedUserId: z.string().cuid(),
});