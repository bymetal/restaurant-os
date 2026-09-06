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
  "business:user:read",
  "business:user:role:update"
] as const;

export type PermissionKey = (typeof permissionKeys)[number];

export interface TenantContext {
  userId: string;
  businessId: BusinessId;
  branchId?: BranchId;
}
