import { z } from "zod";

export const platformAnalyticsRangeQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

export const assignSubscriptionRequestSchema = z.object({
  planCode: z.enum(["starter", "growth", "pro"])
});

export const systemIssueIdParamsSchema = z.object({
  issueId: z.string().uuid()
});

export type PlatformAnalyticsRangeQuery = z.infer<typeof platformAnalyticsRangeQuerySchema>;
export type AssignSubscriptionRequest = z.infer<typeof assignSubscriptionRequestSchema>;
export type SystemIssueIdParams = z.infer<typeof systemIssueIdParamsSchema>;
