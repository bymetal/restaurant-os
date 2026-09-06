import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  campaignIdParamsSchema,
  campaignListQuerySchema,
  campaignPerformanceQuerySchema,
  createCampaignRequestSchema,
  updateCampaignRequestSchema
} from "@restaurant-os/contracts";
import { ApiError } from "../errors.js";
import {
  createCampaign,
  getCampaign,
  getCampaignPerformance,
  getCampaignPerformanceSummary,
  listCampaigns,
  updateCampaign
} from "../repositories/campaigns.js";
import { parseInput } from "../validation.js";

export function registerCampaignRoutes(app: FastifyInstance, pool: Pool): void {
  const readAccess = [app.authenticate, app.requireScope("business"), app.requirePermission("business:campaign:read")];
  const writeAccess = [app.authenticate, app.requireScope("business"), app.requirePermission("business:campaign:write")];

  app.get("/v1/campaigns/performance/summary", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    const query = parseInput(campaignPerformanceQuerySchema, request.query);
    return { performance: await getCampaignPerformanceSummary(pool, context.businessId, query.from, query.to) };
  });

  app.get("/v1/campaigns", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    const query = parseInput(campaignListQuerySchema, request.query);
    return { campaigns: await listCampaigns(pool, context.businessId, query.status) };
  });

  app.post("/v1/campaigns", { preHandler: writeAccess }, async (request) => {
    const context = requireBusiness(request);
    const input = parseInput(createCampaignRequestSchema, request.body);
    return { campaign: await createCampaign(pool, context.businessId, input, actorFrom(request)) };
  });

  app.get("/v1/campaigns/:campaignId", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    const { campaignId } = parseInput(campaignIdParamsSchema, request.params);
    const campaign = await getCampaign(pool, context.businessId, campaignId);
    if (!campaign) throw new ApiError(404, "NOT_FOUND", "Campaign not found.");
    return { campaign };
  });

  app.put("/v1/campaigns/:campaignId", { preHandler: writeAccess }, async (request) => {
    const context = requireBusiness(request);
    const { campaignId } = parseInput(campaignIdParamsSchema, request.params);
    const input = parseInput(updateCampaignRequestSchema, request.body);
    return { campaign: await updateCampaign(pool, context.businessId, campaignId, input, actorFrom(request)) };
  });

  app.get("/v1/campaigns/:campaignId/performance", { preHandler: readAccess }, async (request) => {
    const context = requireBusiness(request);
    const { campaignId } = parseInput(campaignIdParamsSchema, request.params);
    const performance = await getCampaignPerformance(pool, context.businessId, campaignId);
    if (!performance) throw new ApiError(404, "NOT_FOUND", "Campaign not found.");
    return { performance };
  });
}

function requireBusiness(request: FastifyRequest) {
  if (!request.auth || request.auth.scope !== "business" || !request.auth.businessId) {
    throw new ApiError(403, "FORBIDDEN", "Business context is required.");
  }
  return request.auth as FastifyRequest["auth"] & { businessId: string };
}

function actorFrom(request: FastifyRequest) {
  const context = requireBusiness(request);
  return {
    userId: context.userId,
    role: context.role,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"]
  };
}
