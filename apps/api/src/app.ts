import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions
} from "fastify";
import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { AuthConfig } from "@restaurant-os/auth";
import {
  liveHealthSchema,
  readyHealthSchema,
  type ReadyHealth
} from "@restaurant-os/contracts";
import { registerAuthPlugin } from "./auth-plugin.js";
import { ApiError } from "./errors.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerPlatformRoutes } from "./routes/platform.js";
import { registerMenuRoutes } from "./routes/menu.js";
import { registerOrderRoutes } from "./routes/orders.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerTenantRoutes } from "./routes/tenant.js";

export interface HealthDependencies {
  checkDatabase: () => Promise<void>;
  checkRedis: () => Promise<void>;
}

export interface BuildAppOptions {
  logger?: FastifyServerOptions["logger"];
  trustProxy?: boolean;
}

export interface AppDependencies extends HealthDependencies {
  pool: Pool;
  redis: Redis;
  publicRateLimitPerMinute: number;
  authConfig: AuthConfig;
}

export function buildApp(
  dependencies: AppDependencies,
  options: BuildAppOptions = {}
): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? {
      level: "info",
      redact: ["req.headers.authorization", "req.headers.cookie"]
    },
    trustProxy: options.trustProxy ?? false,
    requestIdHeader: "x-request-id",
    genReqId: (request) => request.headers["x-request-id"]?.toString() ?? randomUUID()
  });

  registerAuthPlugin(app, dependencies.pool, dependencies.authConfig);
  app.register(cookie);
  registerAuthRoutes(app, { pool: dependencies.pool, authConfig: dependencies.authConfig });
  registerPlatformRoutes(app, dependencies.pool);
  registerTenantRoutes(app, dependencies.pool);
  registerMenuRoutes(app, dependencies.pool);
  registerOrderRoutes(app, dependencies.pool);
  registerPublicRoutes(
    app,
    dependencies.pool,
    dependencies.redis,
    dependencies.authConfig.refreshCookieSecure,
    dependencies.publicRateLimitPerMinute,
    dependencies.authConfig.allowedOrigins
  );

  app.get("/health/live", async () =>
    liveHealthSchema.parse({
      status: "ok",
      service: "api",
      timestamp: new Date().toISOString()
    })
  );

  app.get("/health/ready", async (request, reply) => {
    const dependencyEntries = await Promise.all([
      checkDependency("database", dependencies.checkDatabase, app),
      checkDependency("redis", dependencies.checkRedis, app)
    ]);
    const dependencyStatus = Object.fromEntries(dependencyEntries) as ReadyHealth["dependencies"];
    const ready = Object.values(dependencyStatus).every((status) => status === "ok");
    const response = readyHealthSchema.parse({
      status: ready ? "ok" : "not_ready",
      service: "api",
      timestamp: new Date().toISOString(),
      dependencies: dependencyStatus,
      requestId: request.id
    });

    return ready ? response : reply.code(503).send(response);
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Unhandled request error");
    const statusCode = error instanceof ApiError ? error.statusCode : getStatusCode(error);
    const errorBody: { code: string; message: string; requestId: string; details?: unknown } = {
      code: error instanceof ApiError ? error.code : "INTERNAL_ERROR",
      message: error instanceof ApiError ? error.message : "Unexpected server error.",
      requestId: request.id
    };
    if (error instanceof ApiError && error.details !== undefined) errorBody.details = error.details;
    return reply.code(statusCode).send({
      error: errorBody
    });
  });

  return app;
}

function getStatusCode(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    error.statusCode >= 400
  ) {
    return error.statusCode;
  }
  return 500;
}

async function checkDependency(
  name: keyof ReadyHealth["dependencies"],
  check: () => Promise<void>,
  app: FastifyInstance
): Promise<[keyof ReadyHealth["dependencies"], "ok" | "down"]> {
  try {
    await check();
    return [name, "ok"];
  } catch (error) {
    app.log.warn({ dependency: name, err: error }, "Readiness dependency is unavailable");
    return [name, "down"];
  }
}
