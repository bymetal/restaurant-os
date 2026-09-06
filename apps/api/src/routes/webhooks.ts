import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import { ApiError } from "../errors.js";
import { ingestEvolutionWebhook } from "../repositories/webhooks.js";
import { createRateLimit } from "../rate-limit.js";

export function registerWebhookRoutes(app: FastifyInstance, pool: Pool, redis: Redis): void {
  const webhookLimit = createRateLimit(redis, "webhook-evolution", 600);

  app.post("/v1/webhooks/evolution/:connectionId", { preHandler: [webhookLimit] }, async (request, reply) => {
    const { connectionId } = request.params as { connectionId: string };
    const result = await ingestEvolutionWebhook(pool, connectionId, request.body);
    if (result === "unknown_connection") throw new ApiError(404, "NOT_FOUND", "Unknown webhook connection.");
    return reply.code(200).send({ status: result });
  });
}
