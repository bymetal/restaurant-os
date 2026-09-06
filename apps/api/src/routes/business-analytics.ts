import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { analyticsBranchQuerySchema, analyticsRangeQuerySchema } from "@restaurant-os/contracts";
import { ApiError } from "../errors.js";
import {
  getCustomerMix,
  getInsights,
  getLiveOrderCounts,
  getLoyaltySummary,
  getOverview,
  getPeakHours,
  getRepeatRate,
  getRevenueSeries,
  getTopProducts
} from "../repositories/business-analytics.js";
import { parseInput } from "../validation.js";

export function registerBusinessAnalyticsRoutes(app: FastifyInstance, pool: Pool): void {
  const readAccess = [app.authenticate, app.requireScope("business"), app.requirePermission("business:analytics:read")];

  app.get("/v1/analytics/overview", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    return { overview: await getOverview(pool, context.businessId, parseInput(analyticsRangeQuerySchema, request.query)) };
  });

  app.get("/v1/analytics/revenue-series", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    return { series: await getRevenueSeries(pool, context.businessId, parseInput(analyticsRangeQuerySchema, request.query)) };
  });

  app.get("/v1/analytics/customer-mix", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    return { mix: await getCustomerMix(pool, context.businessId, parseInput(analyticsRangeQuerySchema, request.query)) };
  });

  app.get("/v1/analytics/repeat-rate", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    return { repeatRate: await getRepeatRate(pool, context.businessId, parseInput(analyticsRangeQuerySchema, request.query)) };
  });

  app.get("/v1/analytics/top-products", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    return { products: await getTopProducts(pool, context.businessId, parseInput(analyticsRangeQuerySchema, request.query), 5) };
  });

  app.get("/v1/analytics/peak-hours", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    return { hours: await getPeakHours(pool, context.businessId, parseInput(analyticsRangeQuerySchema, request.query)) };
  });

  app.get("/v1/analytics/loyalty-summary", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    return { summary: await getLoyaltySummary(pool, context.businessId) };
  });

  app.get("/v1/analytics/insights", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    return { insights: await getInsights(pool, context.businessId, parseInput(analyticsRangeQuerySchema, request.query)) };
  });

  app.get(
    "/v1/orders/live-counts",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:order:read")] },
    async (request) => {
      const context = requireBusiness(request);
      const query = parseInput(analyticsBranchQuerySchema, request.query);
      return { counts: await getLiveOrderCounts(pool, context.businessId, query.branchId) };
    }
  );
}

function requireBusiness(request: FastifyRequest) {
  if (!request.auth || request.auth.scope !== "business" || !request.auth.businessId) {
    throw new ApiError(403, "FORBIDDEN", "Business context is required.");
  }
  return request.auth as FastifyRequest["auth"] & { businessId: string };
}
