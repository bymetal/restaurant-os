import { z } from "zod";

const discountType = z.enum(["percentage", "fixed_amount"]);
const campaignStatus = z.enum(["draft", "scheduled", "active", "paused", "completed", "archived"]);

export const createCampaignRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(255),
    description: z.string().trim().max(1_000).optional(),
    discountType,
    discountValue: z.number().int().min(1).max(100_000_000),
    couponCode: z
      .string()
      .trim()
      .min(3)
      .max(50)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((value) => value.toUpperCase()),
    minOrderAmountMinor: z.number().int().min(0).default(0),
    maxRedemptions: z.number().int().min(1).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().optional()
  })
  .superRefine((input, ctx) => {
    if (input.discountType === "percentage" && input.discountValue > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Percentage discount cannot exceed 100."
      });
    }
    if (input.endsAt && input.startsAt >= input.endsAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "endsAt must be after startsAt." });
    }
  });

export const updateCampaignRequestSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  description: z.string().trim().max(1_000).optional(),
  discountValue: z.number().int().min(1).max(100_000_000).optional(),
  minOrderAmountMinor: z.number().int().min(0).optional(),
  maxRedemptions: z.number().int().min(1).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  status: campaignStatus.optional()
});

export const campaignIdParamsSchema = z.object({
  campaignId: z.string().uuid()
});

export const campaignListQuerySchema = z.object({
  status: campaignStatus.optional()
});

export const campaignPerformanceQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

export type CreateCampaignRequest = z.infer<typeof createCampaignRequestSchema>;
export type UpdateCampaignRequest = z.infer<typeof updateCampaignRequestSchema>;
export type CampaignIdParams = z.infer<typeof campaignIdParamsSchema>;
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;
export type CampaignPerformanceQuery = z.infer<typeof campaignPerformanceQuerySchema>;
