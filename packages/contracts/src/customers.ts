import { z } from "zod";

const segment = z.enum(["new", "regular", "vip", "at_risk"]);

export const customerListQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  segment: segment.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const updateCustomerRequestSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  segment: segment.optional(),
  acquisitionSource: z.string().trim().max(200).optional(),
  preferredBranchId: z.string().uuid().optional(),
  preferredFulfillment: z.enum(["delivery", "pickup", "dine_in"]).optional(),
  birthday: z.string().date().optional()
});

export const customerNoteRequestSchema = z.object({
  body: z.string().trim().min(1).max(2_000)
});

export const customerTagRequestSchema = z.object({
  label: z.string().trim().min(1).max(100)
});

export const customerTagIdParamsSchema = z.object({
  customerId: z.string().uuid(),
  tagId: z.string().uuid()
});

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;
export type UpdateCustomerRequest = z.infer<typeof updateCustomerRequestSchema>;
export type CustomerNoteRequest = z.infer<typeof customerNoteRequestSchema>;
export type CustomerTagRequest = z.infer<typeof customerTagRequestSchema>;
export type CustomerTagIdParams = z.infer<typeof customerTagIdParamsSchema>;
