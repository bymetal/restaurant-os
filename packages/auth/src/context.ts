import type { AuthScope, PermissionKey, RoleName } from "@restaurant-os/domain";

export interface AuthContext {
  userId: string;
  email: string;
  displayName: string;
  scope: AuthScope;
  roleId: string;
  role: RoleName;
  permissions: PermissionKey[];
  tokenVersion: number;
  businessId?: string;
}
