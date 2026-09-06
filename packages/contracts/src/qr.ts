import { z } from "zod";

export const qrCodeTypeSchema = z.enum(["ACQUISITION", "LOYALTY_STATIC_ENTRY", "TABLE", "ORDER", "CAMPAIGN"]);

export const createQrCodeRequestSchema = z.object({
  type: qrCodeTypeSchema,
  source: z.string().trim().min(2).max(100),
  branchId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  tableNumber: z.string().trim().max(20).optional()
});

export type CreateQrCodeRequest = z.infer<typeof createQrCodeRequestSchema>;
export type QrCodeType = z.infer<typeof qrCodeTypeSchema>;
