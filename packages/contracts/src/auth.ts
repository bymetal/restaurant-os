import { z } from "zod";

const roleName = z.enum([
  "SUPER_ADMIN",
  "PLATFORM_SUPPORT",
  "OWNER",
  "MANAGER",
  "CASHIER",
  "KITCHEN",
  "MARKETING",
  "ANALYST"
]);

const authScope = z.enum(["platform", "business"]);

export const loginRequestSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(512),
  businessId: z.string().uuid().optional()
});

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(512),
  newPassword: z.string().min(12).max(512)
});

export const userContextSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  scope: authScope,
  role: roleName,
  permissions: z.array(z.string()),
  businessId: z.string().uuid().nullable()
});

export const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: userContextSchema
});

export const createBusinessRequestSchema = z.object({
  name: z.string().trim().min(2).max(255),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  timezone: z.string().trim().min(1).max(100).default("Europe/Istanbul"),
  currency: z.string().regex(/^[A-Z]{3}$/).default("TRY"),
  branchName: z.string().trim().min(2).max(255),
  branchAddress: z.string().trim().max(500).optional(),
  ownerEmail: z.string().email().max(320),
  ownerDisplayName: z.string().trim().min(2).max(255),
  ownerPassword: z.string().min(12).max(512)
});

export const createBranchRequestSchema = z.object({
  name: z.string().trim().min(2).max(255),
  addressText: z.string().trim().max(500).optional()
});

export const roleAssignmentRequestSchema = z.object({
  role: z.enum(["OWNER", "MANAGER"])
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type CreateBusinessRequest = z.infer<typeof createBusinessRequestSchema>;
export type CreateBranchRequest = z.infer<typeof createBranchRequestSchema>;
export type RoleAssignmentRequest = z.infer<typeof roleAssignmentRequestSchema>;
