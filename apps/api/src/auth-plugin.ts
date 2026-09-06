import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  type AuthConfig,
  type AuthContext,
  verifyAccessToken
} from "@restaurant-os/auth";
import type { PermissionKey, AuthScope } from "@restaurant-os/domain";
import { ApiError } from "./errors.js";
import { loadAuthContext } from "./repositories/identity.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireScope: (scope: AuthScope) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (
      permission: PermissionKey
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function registerAuthPlugin(
  app: FastifyInstance,
  pool: Pool,
  authConfig: AuthConfig
): void {
  app.decorateRequest("auth", null);
  app.decorate("authenticate", async (request: FastifyRequest) => {
    const token = parseBearerToken(request.headers.authorization);
    if (!token) throw new ApiError(401, "AUTH_TOKEN_MISSING", "Authentication is required.");

    try {
      const claims = await verifyAccessToken(token, authConfig);
      request.auth = await loadAuthContext(pool, claims);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(401, "AUTH_TOKEN_INVALID", "Authentication is not valid.");
    }
  });

  app.decorate("requireScope", (scope: AuthScope) => async (request: FastifyRequest) => {
    if (!request.auth) throw new ApiError(401, "AUTH_TOKEN_MISSING", "Authentication is required.");
    if (request.auth.scope !== scope) throw new ApiError(403, "FORBIDDEN", "This scope is not permitted.");
  });

  app.decorate("requirePermission", (permission: PermissionKey) => async (request: FastifyRequest) => {
    if (!request.auth) throw new ApiError(401, "AUTH_TOKEN_MISSING", "Authentication is required.");
    if (!request.auth.permissions.includes(permission)) {
      throw new ApiError(403, "FORBIDDEN", "You do not have permission for this action.");
    }
  });
}

function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}
