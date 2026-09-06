export type BusinessId = string & { readonly __brand: "BusinessId" };
export type BranchId = string & { readonly __brand: "BranchId" };

export const platformRoles = ["SUPER_ADMIN", "PLATFORM_SUPPORT"] as const;
export const businessRoles = ["OWNER", "MANAGER", "CASHIER", "KITCHEN", "MARKETING", "ANALYST"] as const;
export const roleNames = [...platformRoles, ...businessRoles] as const;

export type PlatformRole = (typeof platformRoles)[number];
export type BusinessRole = (typeof businessRoles)[number];
export type RoleName = (typeof roleNames)[number];

export type AuthScope = "platform" | "business";

export const permissionKeys = [
  "platform:business:read",
  "platform:business:create",
  "platform:business:update",
  "platform:user:role:update",
  "business:business:read",
  "business:business:update",
  "business:branch:read",
  "business:branch:create",
  "business:menu:read",
  "business:menu:write",
  "business:order:read",
  "business:order:update",
  "business:user:read",
  "business:user:role:update",
  "business:loyalty:read",
  "business:loyalty:redeem",
  "business:loyalty:write",
  "business:customer:read",
  "business:customer:write",
  "business:campaign:read",
  "business:campaign:write",
  "business:analytics:read",
  "platform:analytics:read",
  "platform:subscription:write",
  "platform:system_issue:update",
  "business:integration:read",
  "business:integration:write",
  "business:qr:write"
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export interface TenantContext {
  userId: string;
  businessId: BusinessId;
  branchId?: BranchId;
}

export {
  isProductAvailable,
  type AvailabilityWindow,
  type ProductAvailability,
  type Weekday,
  type WeeklySchedule
} from "./availability.js";
export {
  calculateCartLineTotal,
  calculateCartUnitPrice,
  type PriceSnapshot
} from "./pricing.js";
export {
  assertOrderTransition,
  canTransitionOrder,
  orderStatuses,
  orderTransitions,
  type FulfillmentType,
  type OrderStatus
} from "./order.js";
export {
  calculateOrderTotals,
  type OrderTotals,
  type OrderTotalsInput
} from "./totals.js";
export { calculateDeliveryFee, type DeliveryFeeInput } from "./delivery.js";
export {
  assertRedeemable,
  calculateStampsEarned,
  isRewardAvailable,
  stampsUntilReward,
  type LoyaltyProgramRules
} from "./loyalty.js";
export {
  calculateCampaignDiscount,
  campaignStatuses,
  campaignTransitions,
  canTransitionCampaign,
  type CampaignDiscountRule,
  type CampaignStatus
} from "./campaign.js";
export { InvalidPhoneError, normalizePhone } from "./customer.js";
export {
  consentStatuses,
  consentTypes,
  isOptOutMessage,
  parseInboundCommand,
  type ConsentStatus,
  type ConsentType,
  type ParsedInboundCommand
} from "./consent.js";
