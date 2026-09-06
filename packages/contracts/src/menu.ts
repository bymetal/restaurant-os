import { z } from "zod";

const name = z.string().trim().min(2).max(255);
const price = z.number().int().min(0).max(100_000_000);
const sortOrder = z.number().int().min(-1_000_000).max(1_000_000).default(0);

export const createCategoryRequestSchema = z.object({
  name,
  description: z.string().trim().max(500).optional(),
  sortOrder,
  active: z.boolean().default(true)
});

export const createProductRequestSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name,
  description: z.string().trim().max(2_000).optional(),
  photoUrl: z.string().url().max(2_000).optional(),
  basePrice: price,
  allergens: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  tags: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  prepMetadata: z.record(z.unknown()).default({}),
  sortOrder,
  active: z.boolean().default(true)
});

export const createVariantRequestSchema = z.object({
  name,
  priceAdjustment: z.number().int().min(-100_000_000).max(100_000_000).default(0),
  sortOrder,
  active: z.boolean().default(true)
});

export const createModifierGroupRequestSchema = z.object({
  name,
  required: z.boolean().default(false),
  minSelections: z.number().int().min(0).max(100).default(0),
  maxSelections: z.number().int().min(0).max(100).default(1),
  multiSelect: z.boolean().default(false),
  sortOrder
}).refine((input) => input.maxSelections >= input.minSelections, {
  message: "maxSelections must be greater than or equal to minSelections.",
  path: ["maxSelections"]
});

export const createModifierRequestSchema = z.object({
  name,
  priceAdjustment: price.default(0),
  sortOrder,
  active: z.boolean().default(true)
});

const availabilityWindowSchema = z.object({
  start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
});

export const availabilityRequestSchema = z.object({
  available: z.boolean(),
  availableFrom: z.string().datetime().optional(),
  availableUntil: z.string().datetime().optional(),
  schedule: z.record(z.array(availabilityWindowSchema)).default({})
}).refine(
  (input) => !input.availableFrom || !input.availableUntil || input.availableFrom < input.availableUntil,
  { message: "availableFrom must be before availableUntil.", path: ["availableUntil"] }
);

export const createCartRequestSchema = z.object({
  branchSlug: z.string().trim().min(1).max(100).optional(),
  source: z.string().trim().max(100).optional()
});

export const publicMenuQuerySchema = z.object({
  branchSlug: z.string().trim().min(1).max(100).optional()
});

export const addCartItemRequestSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  modifierIds: z.array(z.string().uuid()).max(100).default([]),
  quantity: z.number().int().min(1).max(99)
});

export type AddCartItemRequest = z.infer<typeof addCartItemRequestSchema>;
export type AvailabilityRequest = z.infer<typeof availabilityRequestSchema>;
export type CreateCartRequest = z.infer<typeof createCartRequestSchema>;
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;
export type CreateModifierGroupRequest = z.infer<typeof createModifierGroupRequestSchema>;
export type CreateModifierRequest = z.infer<typeof createModifierRequestSchema>;
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;
export type CreateVariantRequest = z.infer<typeof createVariantRequestSchema>;
export type PublicMenuQuery = z.infer<typeof publicMenuQuerySchema>;
