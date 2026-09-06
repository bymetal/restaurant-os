import { z } from "zod";

export const upsertLoyaltyProgramRequestSchema = z.object({
  name: z.string().trim().min(2).max(255),
  description: z.string().trim().max(1_000).optional(),
  rewardDescription: z.string().trim().min(2).max(500),
  goalCount: z.number().int().min(1).max(1_000),
  earnPerOrder: z.number().int().min(1).max(100).default(1),
  minOrderAmountMinor: z.number().int().min(0).default(0)
});

export const loyaltyAdjustRequestSchema = z.object({
  amount: z.number().int().min(1).max(10_000),
  direction: z.enum(["ADD", "REMOVE"]),
  reason: z.string().trim().min(2).max(500)
});

export const customerIdParamsSchema = z.object({
  customerId: z.string().uuid()
});

export const issueLoyaltyClaimTokenRequestSchema = z.object({
  branchId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  ttlMinutes: z.number().int().min(1).max(1_440).optional()
});

export type UpsertLoyaltyProgramRequest = z.infer<typeof upsertLoyaltyProgramRequestSchema>;
export type LoyaltyAdjustRequest = z.infer<typeof loyaltyAdjustRequestSchema>;
export type CustomerIdParams = z.infer<typeof customerIdParamsSchema>;
export type IssueLoyaltyClaimTokenRequest = z.infer<typeof issueLoyaltyClaimTokenRequestSchema>;
