import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import type { EvolutionConfig } from "@restaurant-os/integrations";
import { ApiError } from "../errors.js";
import { connectWhatsApp, disconnectWhatsApp, getConnection } from "../repositories/evolution.js";

export function registerEvolutionRoutes(
  app: FastifyInstance,
  pool: Pool,
  evolutionConfig: EvolutionConfig,
  appUrl: string,
  appEncryptionKey: string
): void {
  app.get(
    "/v1/integrations/whatsapp",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:integration:read")] },
    async (request) => {
      const context = requireBusiness(request);
      return { connection: await getConnection(pool, context.businessId) };
    }
  );

  app.post(
    "/v1/integrations/whatsapp/connect",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:integration:write")] },
    async (request) => {
      const context = requireBusiness(request);
      const connection = await connectWhatsApp(pool, context.businessId, evolutionConfig, appUrl, appEncryptionKey, {
        userId: context.userId,
        role: context.role,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      });
      return { connection };
    }
  );

  app.post(
    "/v1/integrations/whatsapp/disconnect",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:integration:write")] },
    async (request) => {
      const context = requireBusiness(request);
      await disconnectWhatsApp(pool, context.businessId, evolutionConfig, {
        userId: context.userId,
        role: context.role,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      });
      return { connected: false };
    }
  );
}

function requireBusiness(request: FastifyRequest) {
  if (!request.auth || request.auth.scope !== "business" || !request.auth.businessId) {
    throw new ApiError(403, "FORBIDDEN", "Business context is required.");
  }
  return request.auth as FastifyRequest["auth"] & { businessId: string };
}
