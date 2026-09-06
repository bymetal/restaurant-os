import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import {
  createRefreshToken,
  dummyPasswordHash,
  hashPassword,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  verifyPassword,
  type AccessTokenClaims,
  type AuthConfig,
  type AuthContext
} from "@restaurant-os/auth";
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  authResponseSchema,
  type LoginRequest
} from "@restaurant-os/contracts";
import { ApiError } from "../errors.js";
import {
  findLoginUser,
  findRefreshToken,
  insertRefreshToken,
  loadAuthContext,
  loadLoginContexts,
  recordFailedLogin,
  resetFailedLogins,
  revokeRefreshFamily
} from "../repositories/identity.js";
import { insertAudit } from "../repositories/tenant.js";
import { parseInput } from "../validation.js";

export interface AuthRouteDependencies {
  pool: Pool;
  authConfig: AuthConfig;
}

export function registerAuthRoutes(app: FastifyInstance, dependencies: AuthRouteDependencies): void {
  app.post("/v1/auth/login", async (request, reply) => {
    const input = parseInput(loginRequestSchema, request.body);
    const email = normalizeEmail(input.email);
    const user = await findLoginUser(dependencies.pool, email);
    if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new ApiError(429, "AUTH_ACCOUNT_LOCKED", "Account is temporarily locked.");
    }

    const passwordValid = await verifyPassword(user?.passwordHash ?? dummyPasswordHash, input.password);
    if (!user || !user.passwordHash || !passwordValid) {
      if (user?.passwordHash) await recordFailedLogin(dependencies.pool, user.userId);
      throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Invalid email or password.");
    }
    await resetFailedLogins(dependencies.pool, user.userId);

    const contexts = await loadLoginContexts(dependencies.pool, user.userId);
    const selected = chooseLoginContext(contexts, input);
    const response = await issueSession(dependencies.pool, dependencies.authConfig, user, selected, request);
    setRefreshCookie(reply, dependencies.authConfig, response.refreshToken);
    return reply.send(authResponseSchema.parse(response.body));
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    assertAllowedOrigin(request, dependencies.authConfig);
    const refreshToken = request.cookies[dependencies.authConfig.refreshCookieName];
    if (!refreshToken) throw new ApiError(401, "AUTH_TOKEN_MISSING", "Refresh authentication is required.");

    const client = await dependencies.pool.connect();
    let committed = false;
    try {
      await client.query("BEGIN");
      const current = await findRefreshToken(client, hashRefreshToken(refreshToken), true);
      if (!current) throw new ApiError(401, "AUTH_TOKEN_INVALID", "Refresh authentication is not valid.");
      if (current.revokedAt) {
        await revokeRefreshFamily(client, current.family);
        await client.query("COMMIT");
        committed = true;
        throw new ApiError(401, "AUTH_REFRESH_REUSED", "Refresh authentication has already been used.");
      }
      if (current.expiresAt.getTime() <= Date.now()) {
        await client.query("COMMIT");
        committed = true;
        throw new ApiError(401, "AUTH_TOKEN_EXPIRED", "Refresh authentication has expired.");
      }

      const claims: AccessTokenClaims = {
        userId: current.userId,
        tokenVersion: await currentTokenVersion(client, current.userId),
        scope: current.scope
      };
      if (current.businessId) claims.businessId = current.businessId;
      const context = await loadAuthContext(client, claims);
      const nextRefreshToken = createRefreshToken();
      const nextId = await insertRefreshToken(client, {
        userId: current.userId,
        scope: current.scope,
        family: current.family,
        tokenHash: hashRefreshToken(nextRefreshToken),
        expiresAt: refreshTokenExpiry(dependencies.authConfig),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      });
      if (current.businessId) {
        await client.query(`UPDATE refresh_tokens SET business_id = $2 WHERE id = $1`, [nextId, current.businessId]);
      }
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`,
        [current.id, nextId]
      );
      const accessToken = await signAccessToken(claims, dependencies.authConfig);
      await client.query("COMMIT");
      committed = true;
      setRefreshCookie(reply, dependencies.authConfig, nextRefreshToken);
      return reply.send(
        authResponseSchema.parse({
          accessToken,
          expiresIn: dependencies.authConfig.accessTokenTtlSeconds,
          user: userContext(context)
        })
      );
    } catch (error) {
      if (!committed) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  app.post(
    "/v1/auth/logout",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const refreshToken = request.cookies[dependencies.authConfig.refreshCookieName];
      if (refreshToken) {
        await dependencies.pool.query(
          `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash = $1`,
          [hashRefreshToken(refreshToken)]
        );
      }
      reply.clearCookie(dependencies.authConfig.refreshCookieName, {
        httpOnly: true,
        secure: dependencies.authConfig.refreshCookieSecure,
        sameSite: "strict",
        path: "/v1/auth"
      });
      return reply.code(204).send();
    }
  );

  app.post(
    "/v1/auth/change-password",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const context = requireAuth(request);
      const input = parseInput(changePasswordRequestSchema, request.body);
      const client = await dependencies.pool.connect();
      let committed = false;
      try {
        await client.query("BEGIN");
        const result = await client.query<{ passwordHash: string }>(
          `SELECT password_hash AS "passwordHash" FROM user_credentials WHERE user_id = $1 FOR UPDATE`,
          [context.userId]
        );
        const credentials = result.rows[0];
        if (!credentials || !(await verifyPassword(credentials.passwordHash, input.currentPassword))) {
          throw new ApiError(401, "AUTH_INVALID_CREDENTIALS", "Current password is not valid.");
        }
        const nextHash = await hashPassword(input.newPassword);
        await client.query(
          `UPDATE user_credentials SET password_hash = $2, password_changed_at = now(), failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1`,
          [context.userId, nextHash]
        );
        await client.query(`UPDATE platform_users SET token_version = token_version + 1 WHERE id = $1`, [context.userId]);
        await client.query(`UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE user_id = $1`, [context.userId]);
        await insertAudit(client, {
          businessId: context.businessId,
          actorUserId: context.userId,
          actorRole: context.role,
          action: "auth.password.change",
          entityType: "platform_user",
          entityId: context.userId,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"]
        });
        await client.query("COMMIT");
        committed = true;
        reply.clearCookie(dependencies.authConfig.refreshCookieName, {
          httpOnly: true,
          secure: dependencies.authConfig.refreshCookieSecure,
          sameSite: "strict",
          path: "/v1/auth"
        });
        return reply.code(204).send();
      } catch (error) {
        if (!committed) await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
  );

  app.get("/v1/me", { preHandler: [app.authenticate] }, async (request) => {
    return { user: userContext(requireAuth(request)) };
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function chooseLoginContext(
  contexts: Awaited<ReturnType<typeof loadLoginContexts>>,
  input: LoginRequest
) {
  if (input.businessId) {
    const businessContext = contexts.find(
      (context) => context.scope === "business" && context.businessId === input.businessId
    );
    if (!businessContext) throw new ApiError(403, "FORBIDDEN", "User is not a member of this business.");
    return businessContext;
  }
  const platformContext = contexts.find((context) => context.scope === "platform");
  if (platformContext) return platformContext;
  const businessContexts = contexts.filter((context) => context.scope === "business");
  if (businessContexts.length === 1 && businessContexts[0]) return businessContexts[0];
  if (businessContexts.length > 1) {
    throw new ApiError(400, "AUTH_BUSINESS_REQUIRED", "Business context is required for this account.");
  }
  throw new ApiError(403, "FORBIDDEN", "No active access context is assigned.");
}

async function issueSession(
  pool: Pool,
  authConfig: AuthConfig,
  user: NonNullable<Awaited<ReturnType<typeof findLoginUser>>>,
  selected: Awaited<ReturnType<typeof loadLoginContexts>>[number],
  request: FastifyRequest
) {
  const claims: AccessTokenClaims = {
    userId: user.userId,
    tokenVersion: user.tokenVersion,
    scope: selected.scope
  };
  if (selected.businessId) claims.businessId = selected.businessId;
  const accessToken = await signAccessToken(claims, authConfig);
  const refreshToken = createRefreshToken();
  const refreshInput: Parameters<typeof insertRefreshToken>[1] = {
    userId: user.userId,
    scope: selected.scope,
    family: randomUUID(),
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshTokenExpiry(authConfig),
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"]
  };
  if (selected.businessId) refreshInput.businessId = selected.businessId;
  await insertRefreshToken(pool, refreshInput);
  const loadedContext = await loadAuthContext(pool, claims);
  return {
    refreshToken,
    body: {
      accessToken,
      expiresIn: authConfig.accessTokenTtlSeconds,
      user: userContext(loadedContext)
    }
  };
}

function userContext(context: AuthContext) {
  return {
    id: context.userId,
    email: context.email,
    displayName: context.displayName,
    scope: context.scope,
    role: context.role,
    permissions: context.permissions,
    businessId: context.businessId ?? null
  };
}

function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new ApiError(401, "AUTH_TOKEN_MISSING", "Authentication is required.");
  return request.auth;
}

function setRefreshCookie(
  reply: FastifyReply,
  config: AuthConfig,
  value: string
): void {
  reply.setCookie(config.refreshCookieName, value, {
    httpOnly: true,
    secure: config.refreshCookieSecure,
    sameSite: "strict",
    path: "/v1/auth",
    maxAge: config.refreshTokenTtlDays * 24 * 60 * 60
  });
}

function assertAllowedOrigin(request: FastifyRequest, config: AuthConfig): void {
  const origin = request.headers.origin;
  if (origin && !config.allowedOrigins.includes(origin)) {
    throw new ApiError(403, "CSRF_ORIGIN_REJECTED", "Request origin is not allowed.");
  }
}

async function currentTokenVersion(client: PoolClient, userId: string): Promise<number> {
  const result = await client.query<{ tokenVersion: number }>(
    `SELECT token_version AS "tokenVersion" FROM platform_users WHERE id = $1 AND active = true`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(401, "AUTH_TOKEN_REVOKED", "Authentication is no longer valid.");
  return row.tokenVersion;
}
