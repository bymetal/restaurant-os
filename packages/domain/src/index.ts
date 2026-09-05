export type BusinessId = string & { readonly __brand: "BusinessId" };
export type BranchId = string & { readonly __brand: "BranchId" };

export interface TenantContext {
  userId: string;
  businessId: BusinessId;
  branchId?: BranchId;
}
