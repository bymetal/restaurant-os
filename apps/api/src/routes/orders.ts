import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  orderIdParamsSchema,
  orderListQuerySchema,
  orderTransitionRequestSchema
} from "@restaurant-os/contracts";
import { ApiError } from "../errors.js";
import { getOrder, listOrders, transitionOrder } from "../repositories/orders.js";
import { parseInput } from "../validation.js";

export function registerOrderRoutes(app: FastifyInstance, pool: Pool): void {
  app.get(
    "/v1/orders",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:order:read")] },
    async (request) => {
      const context = requireBusiness(request);
      return { orders: await listOrders(pool, context.businessId, parseInput(orderListQuerySchema, request.query)) };
    }
  );

  app.get(
    "/v1/orders/:orderId",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:order:read")] },
    async (request) => {
      const context = requireBusiness(request);
      const { orderId } = parseInput(orderIdParamsSchema, request.params);
      const order = await getOrder(pool, context.businessId, orderId);
      if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found.");
      return { order };
    }
  );

  app.post(
    "/v1/orders/:orderId/transition",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:order:update")] },
    async (request) => {
      const context = requireBusiness(request);
      const { orderId } = parseInput(orderIdParamsSchema, request.params);
      return {
        order: await transitionOrder(pool, context.businessId, orderId, parseInput(orderTransitionRequestSchema, request.body), {
          userId: context.userId,
          role: context.role,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"]
        })
      };
    }
  );
}

function requireBusiness(request: FastifyRequest) {
  if (!request.auth || request.auth.scope !== "business" || !request.auth.businessId) {
    throw new ApiError(403, "FORBIDDEN", "Business context is required.");
  }
  return request.auth as FastifyRequest["auth"] & { businessId: string };
}
