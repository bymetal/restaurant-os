import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  availabilityRequestSchema,
  createCategoryRequestSchema,
  createModifierGroupRequestSchema,
  createModifierRequestSchema,
  createProductRequestSchema,
  createVariantRequestSchema
} from "@restaurant-os/contracts";
import { ApiError } from "../errors.js";
import {
  createCategory,
  createModifier,
  createModifierGroup,
  createProduct,
  createVariant,
  getMenu,
  upsertAvailability
} from "../repositories/menu.js";
import { parseInput } from "../validation.js";

export function registerMenuRoutes(app: FastifyInstance, pool: Pool): void {
  app.get(
    "/v1/menu",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:menu:read")] },
    async (request) => ({ menu: await getMenu(pool, requireBusiness(request)) })
  );

  app.post(
    "/v1/categories",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:menu:write")] },
    async (request) => createCategory(pool, requireBusiness(request), parseInput(createCategoryRequestSchema, request.body), actor(request))
  );

  app.post(
    "/v1/products",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:menu:write")] },
    async (request) => createProduct(pool, requireBusiness(request), parseInput(createProductRequestSchema, request.body), actor(request))
  );

  app.post(
    "/v1/products/:productId/variants",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:menu:write")] },
    async (request) => {
      const { productId } = request.params as { productId: string };
      return createVariant(pool, requireBusiness(request), productId, parseInput(createVariantRequestSchema, request.body), actor(request));
    }
  );

  app.post(
    "/v1/products/:productId/modifier-groups",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:menu:write")] },
    async (request) => {
      const { productId } = request.params as { productId: string };
      return createModifierGroup(pool, requireBusiness(request), productId, parseInput(createModifierGroupRequestSchema, request.body), actor(request));
    }
  );

  app.post(
    "/v1/modifier-groups/:groupId/modifiers",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:menu:write")] },
    async (request) => {
      const { groupId } = request.params as { groupId: string };
      return createModifier(pool, requireBusiness(request), groupId, parseInput(createModifierRequestSchema, request.body), actor(request));
    }
  );

  app.put(
    "/v1/products/:productId/availability/:branchId",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:menu:write")] },
    async (request) => {
      const { productId, branchId } = request.params as { productId: string; branchId: string };
      return upsertAvailability(pool, requireBusiness(request), productId, branchId, parseInput(availabilityRequestSchema, request.body), actor(request));
    }
  );
}

function requireBusiness(request: FastifyRequest): string {
  if (!request.auth || request.auth.scope !== "business" || !request.auth.businessId) {
    throw new ApiError(403, "FORBIDDEN", "Business context is required.");
  }
  return request.auth.businessId;
}

function actor(request: FastifyRequest) {
  if (!request.auth) throw new ApiError(401, "AUTH_TOKEN_MISSING", "Authentication is required.");
  return {
    userId: request.auth.userId,
    role: request.auth.role,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"]
  };
}
