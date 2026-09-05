import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions
} from "fastify";
import { randomUUID } from "node:crypto";
import {
  liveHealthSchema,
  readyHealthSchema,
  type ReadyHealth
} from "@restaurant-os/contracts";

export interface HealthDependencies {
  checkDatabase: () => Promise<void>;
  checkRedis: () => Promise<void>;
}

export interface BuildAppOptions {
  logger?: FastifyServerOptions["logger"];
}

export function buildApp(
  dependencies: HealthDependencies,
  options: BuildAppOptions = {}
): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? {
      level: "info",
      redact: ["req.headers.authorization", "req.headers.cookie"]
    },
    requestIdHeader: "x-request-id",
    genReqId: (request) => request.headers["x-request-id"]?.toString() ?? randomUUID()
  });

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
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error &&
      typeof error.statusCode === "number" && error.statusCode >= 400
        ? error.statusCode
        : 500;
    return reply.code(statusCode).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected server error.",
        requestId: request.id
      }
    });
  });

  return app;
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
