import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import {
  deviceIdParamsSchema,
  printJobAckRequestSchema,
  printJobIdParamsSchema,
  registerPrintDeviceRequestSchema
} from "@restaurant-os/contracts";
import { ApiError } from "../errors.js";
import {
  acknowledgeJob,
  authenticateDevice,
  claimPendingJobs,
  listDevices,
  recordHeartbeat,
  registerDevice,
  revokeDevice
} from "../repositories/printers.js";
import { parseInput } from "../validation.js";

export function registerPrinterRoutes(app: FastifyInstance, pool: Pool): void {
  app.get(
    "/v1/printers/devices",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:printer:read")] },
    async (request) => {
      const context = requireBusiness(request);
      return { devices: await listDevices(pool, context.businessId) };
    }
  );

  app.post(
    "/v1/printers/devices",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:printer:write")] },
    async (request, reply) => {
      const context = requireBusiness(request);
      const input = parseInput(registerPrintDeviceRequestSchema, request.body);
      const result = await registerDevice(pool, context.businessId, input, {
        userId: context.userId,
        role: context.role,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      });
      return reply.code(201).send(result);
    }
  );

  app.delete(
    "/v1/printers/devices/:deviceId",
    { preHandler: [app.authenticate, app.requireScope("business"), app.requirePermission("business:printer:write")] },
    async (request) => {
      const context = requireBusiness(request);
      const { deviceId } = parseInput(deviceIdParamsSchema, request.params);
      await revokeDevice(pool, context.businessId, deviceId, {
        userId: context.userId,
        role: context.role,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      });
      return { revoked: true };
    }
  );

  app.post("/v1/printers/heartbeat", async (request) => {
    const device = await authenticateDevice(pool, request.headers.authorization);
    await recordHeartbeat(pool, device);
    return { status: "ok" };
  });

  app.get("/v1/printers/jobs/pending", async (request) => {
    const device = await authenticateDevice(pool, request.headers.authorization);
    return { jobs: await claimPendingJobs(pool, device) };
  });

  app.post("/v1/printers/jobs/:jobId/ack", async (request) => {
    const device = await authenticateDevice(pool, request.headers.authorization);
    const { jobId } = parseInput(printJobIdParamsSchema, request.params);
    const input = parseInput(printJobAckRequestSchema, request.body);
    await acknowledgeJob(pool, device, jobId, input);
    return { status: "ok" };
  });
}

function requireBusiness(request: FastifyRequest) {
  if (!request.auth || request.auth.scope !== "business" || !request.auth.businessId) {
    throw new ApiError(403, "FORBIDDEN", "Business context is required.");
  }
  return request.auth as FastifyRequest["auth"] & { businessId: string };
}
