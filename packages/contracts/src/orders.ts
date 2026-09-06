import { z } from "zod";

const addressSchema = z.object({
  label: z.string().trim().min(1).max(100).optional(),
  addressText: z.string().trim().min(5).max(500),
  district: z.string().trim().max(120).optional(),
  city: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(20).optional(),
  lat: z.number().finite().min(-90).max(90).optional(),
  lng: z.number().finite().min(-180).max(180).optional(),
  building: z.string().trim().max(100).optional(),
  apartment: z.string().trim().max(100).optional(),
  floor: z.string().trim().max(50).optional(),
  instructions: z.string().trim().max(500).optional()
});

export const checkoutRequestSchema = z.object({
  fulfillment: z.enum(["delivery", "pickup", "dine_in"]),
  scheduledFor: z.string().datetime().optional(),
  customer: z.object({
    name: z.string().trim().min(2).max(255),
    phone: z.string().trim().min(7).max(30)
  }),
  address: addressSchema.optional(),
  note: z.string().trim().max(1_000).optional(),
  deliveryInstructions: z.string().trim().max(500).optional(),
  payment: z.object({
    method: z.enum(["cash", "card_on_delivery", "pay_at_restaurant"]),
    amountMinor: z.number().int().min(0).optional()
  })
}).superRefine((input, context) => {
  if (input.fulfillment === "delivery" && !input.address) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["address"],
      message: "Address is required for delivery."
    });
  }
  if (input.scheduledFor && new Date(input.scheduledFor).getTime() < Date.now()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["scheduledFor"],
      message: "Scheduled order time must be in the future."
    });
  }
});

export const orderTransitionRequestSchema = z.object({
  toStatus: z.enum([
    "ACCEPTED",
    "PREPARING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "REJECTED",
    "CANCELLED",
    "REFUNDED"
  ]),
  reason: z.string().trim().max(500).optional()
});

export const orderListQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  status: z.enum([
    "DRAFT",
    "PLACED",
    "ACCEPTED",
    "PREPARING",
    "READY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "REJECTED",
    "CANCELLED",
    "REFUNDED"
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const orderIdParamsSchema = z.object({
  orderId: z.string().uuid()
});

export const orderResponseSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.number().int().positive(),
  businessId: z.string().uuid(),
  branchId: z.string().uuid(),
  status: z.string(),
  fulfillmentType: z.enum(["delivery", "pickup", "dine_in"]),
  currency: z.string().length(3),
  scheduledFor: z.date().nullable(),
  customer: z.object({
    id: z.string().uuid().nullable(),
    name: z.string(),
    phone: z.string()
  }),
  address: z.unknown().nullable(),
  note: z.string().nullable(),
  deliveryInstructions: z.string().nullable(),
  items: z.array(z.unknown()),
  subtotalMinor: z.number().int().nonnegative(),
  deliveryFeeMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative(),
  taxMinor: z.number().int().nonnegative(),
  totalMinor: z.number().int().nonnegative(),
  payment: z.object({
    method: z.string(),
    status: z.string(),
    amountMinor: z.number().int().nonnegative()
  }),
  createdAt: z.date(),
  updatedAt: z.date()
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type OrderTransitionRequest = z.infer<typeof orderTransitionRequestSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
