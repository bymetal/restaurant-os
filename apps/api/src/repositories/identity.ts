import type { Pool, PoolClient } from "pg";
import type { AccessTokenClaims, AuthContext } from "@restaurant-os/auth";
import type { AuthScope, PermissionKey, RoleName } from "@restaurant-os/domain";
import { ApiError } from "../errors.js";

export interface LoginUser {
  userId: string;
  email: string;
  displayName: string;
  active: boolean;
  tokenVersion: number;
  passwordHash: string | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

export interface LoginContext {
  scope: AuthScope;
  roleId: string;
  role: RoleName;
  businessId?: string;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  scope: AuthScope;
  businessId: string | null;
  family: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export async function findLoginUser(pool: Pool, email: string): Promise<LoginUser | null> {
  const result = await pool.query<LoginUser>(
    `
      SELECT
        pu.id AS "userId",
        pu.email,
        pu.display_name AS "displayName",
        pu.active,
        pu.token_version AS "tokenVersion",
        uc.password_hash AS "passwordHash",
        COALESCE(uc.failed_login_attempts, 0) AS "failedLoginAttempts",
        uc.locked_until AS "lockedUntil"
      FROM platform_users pu
      LEFT JOIN user_credentials uc ON uc.user_id = pu.id
      WHERE lower(pu.email) = lower($1)
    `,
    [email]
  );
  return result.rows[0] ?? null;
}

export async function loadLoginContexts(pool: Pool, userId: string): Promise<LoginContext[]> {
  const [platformRoles, businessRoles] = await Promise.all([
    pool.query<{ roleId: string; role: RoleName }>(
      `
        SELECT r.id AS "roleId", r.name AS role
        FROM platform_user_roles pur
        JOIN roles r ON r.id = pur.role_id
        WHERE pur.user_id = $1 AND r.scope = 'platform'
        ORDER BY CASE WHEN r.name = 'SUPER_ADMIN' THEN 0 ELSE 1 END, r.name
      `,
      [userId]
    ),
    pool.query<{ businessId: string; roleId: string; role: RoleName; active: boolean }>(
      `
        SELECT
          bu.business_id AS "businessId",
          r.id AS "roleId",
          r.name AS role,
          b.active
        FROM business_users bu
        JOIN roles r ON r.id = bu.role_id AND r.scope = 'business'
        JOIN businesses b ON b.id = bu.business_id
        WHERE bu.user_id = $1
        ORDER BY bu.created_at, bu.business_id
      `,
      [userId]
    )
  ]);

  const contexts: LoginContext[] = platformRoles.rows.map((row) => ({
    scope: "platform",
    roleId: row.roleId,
    role: row.role
  }));
  for (const row of businessRoles.rows) {
    if (row.active) {
      contexts.push({
        scope: "business",
        roleId: row.roleId,
        role: row.role,
        businessId: row.businessId
      });
    }
  }
  return contexts;
}

export async function loadAuthContext(pool: Pool | PoolClient, claims: AccessTokenClaims): Promise<AuthContext> {
  const userResult = await pool.query<{
    email: string;
    displayName: string;
    active: boolean;
    tokenVersion: number;
  }>(
    `
      SELECT
        email,
        display_name AS "displayName",
        active,
        token_version AS "tokenVersion"
      FROM platform_users
      WHERE id = $1
    `,
    [claims.userId]
  );
  const user = userResult.rows[0];
  if (!user || !user.active) throw new ApiError(401, "AUTH_TOKEN_REVOKED", "Authentication is no longer valid.");
  if (user.tokenVersion !== claims.tokenVersion) {
    throw new ApiError(401, "AUTH_TOKEN_REVOKED", "Authentication is no longer valid.");
  }

  let role: { roleId: string; role: RoleName; businessId?: string } | undefined;
  if (claims.scope === "platform") {
    const roleResult = await pool.query<{ roleId: string; role: RoleName }>(
      `
        SELECT r.id AS "roleId", r.name AS role
        FROM platform_user_roles pur
        JOIN roles r ON r.id = pur.role_id AND r.scope = 'platform'
        WHERE pur.user_id = $1
        ORDER BY CASE WHEN r.name = 'SUPER_ADMIN' THEN 0 ELSE 1 END, r.name
        LIMIT 1
      `,
      [claims.userId]
    );
    const platformRole = roleResult.rows[0];
    if (!platformRole) throw new ApiError(403, "FORBIDDEN", "Platform access is not assigned.");
    role = platformRole;
  } else {
    if (!claims.businessId) throw new ApiError(401, "AUTH_TOKEN_INVALID", "Business context is missing.");
    const membershipResult = await pool.query<{
      roleId: string;
      role: RoleName;
      businessId: string;
      businessActive: boolean;
    }>(
      `
        SELECT
          r.id AS "roleId",
          r.name AS role,
          bu.business_id AS "businessId",
          b.active AS "businessActive"
        FROM business_users bu
        JOIN roles r ON r.id = bu.role_id AND r.scope = 'business'
        JOIN businesses b ON b.id = bu.business_id
        WHERE bu.user_id = $1 AND bu.business_id = $2
      `,
      [claims.userId, claims.businessId]
    );
    const membership = membershipResult.rows[0];
    if (!membership) throw new ApiError(403, "FORBIDDEN", "User is not a member of this business.");
    if (!membership.businessActive) throw new ApiError(403, "TENANT_SUSPENDED", "This business is suspended.");
    role = {
      roleId: membership.roleId,
      role: membership.role,
      businessId: membership.businessId
    };
  }

  const resolvedRole = role;
  if (!resolvedRole) throw new ApiError(403, "FORBIDDEN", "No role is assigned.");
  const permissionResult = await pool.query<{ key: PermissionKey }>(
    `
      SELECT p.key
      FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = $1
      ORDER BY p.key
    `,
    [resolvedRole.roleId]
  );
  const context: AuthContext = {
    userId: claims.userId,
    email: user.email,
    displayName: user.displayName,
    scope: claims.scope,
    roleId: resolvedRole.roleId,
    role: resolvedRole.role,
    permissions: permissionResult.rows.map((permission) => permission.key),
    tokenVersion: user.tokenVersion
  };
  if (resolvedRole.businessId) context.businessId = resolvedRole.businessId;
  return context;
}

export async function recordFailedLogin(pool: Pool, userId: string): Promise<void> {
  await pool.query(
    `
      UPDATE user_credentials
      SET
        failed_login_attempts = failed_login_attempts + 1,
        locked_until = CASE
          WHEN failed_login_attempts + 1 >= 5 THEN now() + interval '15 minutes'
          ELSE locked_until
        END
      WHERE user_id = $1
    `,
    [userId]
  );
}

export async function resetFailedLogins(pool: Pool, userId: string): Promise<void> {
  await pool.query(
    `UPDATE user_credentials SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1`,
    [userId]
  );
}

export async function insertRefreshToken(
  client: Pool | PoolClient,
  input: {
    userId: string;
    scope: AuthScope;
    businessId?: string;
    family: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress?: string | undefined;
    userAgent?: string | undefined;
  }
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO refresh_tokens (user_id, scope, business_id, family, token_hash, expires_at, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      input.userId,
      input.scope,
      input.businessId ?? null,
      input.family,
      input.tokenHash,
      input.expiresAt,
      input.ipAddress ?? null,
      input.userAgent ?? null
    ]
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to insert refresh token.");
  return row.id;
}

export async function findRefreshToken(
  client: Pool | PoolClient,
  tokenHash: string,
  forUpdate = false
): Promise<RefreshTokenRecord | null> {
  const result = await client.query<RefreshTokenRecord>(
    `
      SELECT
        id,
        user_id AS "userId",
        scope,
        business_id AS "businessId",
        family,
        expires_at AS "expiresAt",
        revoked_at AS "revokedAt"
      FROM refresh_tokens
      WHERE token_hash = $1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export async function revokeRefreshFamily(client: Pool | PoolClient, family: string): Promise<void> {
  await client.query(
    `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE family = $1`,
    [family]
  );
}
