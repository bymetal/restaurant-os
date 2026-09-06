import { z } from "zod";

export const analyticsRangeQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  from: z.string().datetime(),
  to: z.string().datetime()
});

export const analyticsBranchQuerySchema = z.object({
  branchId: z.string().uuid().optional()
});

export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>;
export type AnalyticsBranchQuery = z.infer<typeof analyticsBranchQuerySchema>;
