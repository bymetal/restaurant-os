import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  customerIdParamsSchema,
  loyaltyAdjustRequestSchema,
  upsertLoyaltyProgramRequestSchema
} from "@restaurant-os/contracts";
import { ApiError } from "../errors.js";
import {
  adjustLoyalty,
  assertCustomerExists,
  getActiveProgram,
  getCustomerLoyaltyStatus,
  redeemLoyalty,
  upsertProgram
} from "../repositories/loyalty.js";
import { parseInput } from "../validation.js";

export function registerLoyaltyRoutes(app: FastifyInstance, pool: Pool): void {
  app.get(
    "/v1/loyalty/program",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:loyalty:read")] },
    async (request) => ({ program: await getActiveProgram(pool, requireBusiness(request).businessId) })
  );

  app.put(
    "/v1/loyalty/program",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:loyalty:write")] },
    async (request) => {
      const context = requireBusiness(request);
      const input = parseInput(upsertLoyaltyProgramRequestSchema, request.body);
      return {
        program: await upsertProgram(pool, context.businessId, input, {
          userId: context.userId,
          role: context.role,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"]
        })
      };
    }
  );

  app.get(
    "/v1/customers/:customerId/loyalty",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:loyalty:read")] },
    async (request) => {
      const context = requireBusiness(request);
      const { customerId } = parseInput(customerIdParamsSchema, request.params);
      await assertCustomerExists(pool, context.businessId, customerId);
      return { loyalty: await getCustomerLoyaltyStatus(pool, context.businessId, customerId) };
    }
  );

  app.post(
    "/v1/customers/:customerId/loyalty/adjust",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:loyalty:write")] },
    async (request) => {
      const context = requireBusiness(request);
      const { customerId } = parseInput(customerIdParamsSchema, request.params);
      const idempotencyKey = requireIdempotencyKey(request);
      const input = parseInput(loyaltyAdjustRequestSchema, request.body);
      const result = await adjustLoyalty(pool, context.businessId, customerId, input, idempotencyKey, {
        userId: context.userId,
        role: context.role,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      });
      return { loyalty: result.account };
    }
  );

  app.post(
    "/v1/customers/:customerId/loyalty/redeem",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:loyalty:redeem")] },
    async (request) => {
      const context = requireBusiness(request);
      const { customerId } = parseInput(customerIdParamsSchema, request.params);
      const idempotencyKey = requireIdempotencyKey(request);
      const result = await redeemLoyalty(pool, context.businessId, customerId, idempotencyKey, {
        userId: context.userId,
        role: context.role,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      });
      return { loyalty: result.account };
    }
  );
}

function requireBusiness(request: FastifyRequest) {
  if (!request.auth || request.auth.scope !== "business" || !request.auth.businessId) {
    throw new ApiError(403, "FORBIDDEN", "Business context is required.");
  }
  return request.auth as FastifyRequest["auth"] & { businessId: string };
}

function requireIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0] : value;
  if (!key || key.length < 8 || key.length > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "Idempotency-Key header must contain 8 to 100 characters.");
  }
  return key;
}
