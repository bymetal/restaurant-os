import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { createQrCodeRequestSchema } from "@restaurant-os/contracts";
import { ApiError } from "../errors.js";
import { createQrCode, listQrCodes } from "../repositories/qr.js";
import { parseInput } from "../validation.js";

export function registerQrRoutes(app: FastifyInstance, pool: Pool): void {
  app.get(
    "/v1/qr-codes",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:integration:read")] },
    async (request) => ({ qrCodes: await listQrCodes(pool, requireBusiness(request).businessId) })
  );

  app.post(
    "/v1/qr-codes",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:qr:write")] },
    async (request, reply) => {
      const context = requireBusiness(request);
      const input = parseInput(createQrCodeRequestSchema, request.body);
      const qrCode = await createQrCode(pool, context.businessId, input, {
        userId: context.userId,
        role: context.role,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      });
      return reply.code(201).send({ qrCode });
    }
  );
}

function requireBusiness(request: FastifyRequest) {
  if (!request.auth || request.auth.scope !== "business" || !request.auth.businessId) {
    throw new ApiError(403, "FORBIDDEN", "Business context is required.");
  }
  return request.auth as FastifyRequest["auth"] & { businessId: string };
}
