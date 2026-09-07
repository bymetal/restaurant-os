import { z } from "zod";

export const printDeviceRoleSchema = z.enum(["KITCHEN", "CASHIER"]);

export const registerPrintDeviceRequestSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  role: printDeviceRoleSchema.default("KITCHEN")
});

export const printJobAckRequestSchema = z.object({
  status: z.enum(["PRINTED", "FAILED"]),
  error: z.string().trim().max(500).optional()
});

export const deviceIdParamsSchema = z.object({
  deviceId: z.string().uuid()
});

export const printJobIdParamsSchema = z.object({
  jobId: z.string().uuid()
});

export type PrintDeviceRole = z.infer<typeof printDeviceRoleSchema>;
export type RegisterPrintDeviceRequest = z.infer<typeof registerPrintDeviceRequestSchema>;
export type PrintJobAckRequest = z.infer<typeof printJobAckRequestSchema>;
export type DeviceIdParams = z.infer<typeof deviceIdParamsSchema>;
export type PrintJobIdParams = z.infer<typeof printJobIdParamsSchema>;
