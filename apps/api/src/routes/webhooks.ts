import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { TelegramConfig } from "@restaurant-os/integrations";
import { ApiError } from "../errors.js";
import { ingestEvolutionWebhook, ingestTelegramWebhook } from "../repositories/webhooks.js";
import { createRateLimit } from "../rate-limit.js";

export function registerWebhookRoutes(
  app: FastifyInstance,
  pool: Pool,
  redis: Redis,
  telegramConfig: TelegramConfig,
  telegramWebhookSecret: string
): void {
  const webhookLimit = createRateLimit(redis, "webhook-evolution", 600);
  const telegramLimit = createRateLimit(redis, "webhook-telegram", 600);

  app.post("/v1/webhooks/evolution/:connectionId", { preHandler: [webhookLimit] }, async (request, reply) => {
    const { connectionId } = request.params as { connectionId: string };
    const result = await ingestEvolutionWebhook(pool, connectionId, request.body);
    if (result === "unknown_connection") throw new ApiError(404, "NOT_FOUND", "Unknown webhook connection.");
    return reply.code(200).send({ status: result });
  });

  app.post("/v1/webhooks/telegram", { preHandler: [telegramLimit] }, async (request, reply) => {
    if (request.headers["x-telegram-bot-api-secret-token"] !== telegramWebhookSecret) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid Telegram webhook secret.");
    }
    const result = await ingestTelegramWebhook(pool, telegramConfig, request.body);
    return reply.code(200).send({ status: result });
  });
}
