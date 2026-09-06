import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { createBranchRequestSchema } from "@restaurant-os/contracts";
import { ApiError } from "../errors.js";
import {
  createBranch,
  getBusinessDetail,
  listBranches,
  listBusinessUsers
} from "../repositories/tenant.js";
import { parseInput } from "../validation.js";

export function registerTenantRoutes(app: FastifyInstance, pool: Pool): void {
  const businessRead = [app.authenticate, app.requireScope("business"), app.requirePermission("business:business:read")];

  app.get("/v1/me/business", { preHandler: businessRead }, async (request) => {
    const businessId = requireBusiness(request);
    const business = await getBusinessDetail(pool, businessId);
    if (!business) throw new ApiError(404, "NOT_FOUND", "Business not found.");
    return business;
  });

  app.get(
    "/v1/branches",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:branch:read")] },
    async (request) => ({ branches: await listBranches(pool, requireBusiness(request)) })
  );

  app.post(
    "/v1/branches",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:branch:create")] },
    async (request) => {
      const input = parseInput(createBranchRequestSchema, request.body);
      const context = requireAuth(request);
      return createBranch(pool, context.businessId, input, {
        userId: context.userId,
        role: context.role,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      });
    }
  );

  app.get(
    "/v1/businesses/:businessId/users",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:user:read")] },
    async (request) => {
      const context = requireAuth(request);
      const { businessId } = request.params as { businessId: string };
      if (businessId !== context.businessId) throw new ApiError(403, "FORBIDDEN", "Business access is not permitted.");
      return { users: await listBusinessUsers(pool, context.businessId) };
    }
  );
}

function requireAuth(request: FastifyRequest): FastifyRequest["auth"] & { businessId: string } {
  if (!request.auth || request.auth.scope !== "business" || !request.auth.businessId) {
    throw new ApiError(403, "FORBIDDEN", "Business context is required.");
  }
  return request.auth as FastifyRequest["auth"] & { businessId: string };
}

function requireBusiness(request: FastifyRequest): string {
  return requireAuth(request).businessId;
}
