import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { hashPassword } from "@restaurant-os/auth";
import {
  createBusinessRequestSchema,
  roleAssignmentRequestSchema
} from "@restaurant-os/contracts";
import { ApiError } from "../errors.js";
import {
  assignBusinessRole,
  createBusinessWithOwner,
  getBusinessDetail,
  listBusinesses,
  setBusinessActive
} from "../repositories/tenant.js";
import { parseInput } from "../validation.js";

export function registerPlatformRoutes(app: FastifyInstance, pool: Pool): void {
  const platformRead = [app.authenticate, app.requireScope("platform"), app.requirePermission("platform:business:read")];
  const platformUpdate = [app.authenticate, app.requireScope("platform"), app.requirePermission("platform:business:update")];

  app.post(
    "/v1/platform/businesses",
    {
      preHandler: [app.authenticate, app.requireScope("platform"), app.requirePermission("platform:business:create")]
    },
    async (request, reply) => {
      const input = parseInput(createBusinessRequestSchema, request.body);
      const idempotencyKey = headerValue(request, "idempotency-key");
      if (!idempotencyKey) throw new ApiError(400, "VALIDATION_ERROR", "Idempotency-Key header is required.");
      const passwordHash = await hashPassword(input.ownerPassword);
      const result = await createBusinessWithOwner(
        pool,
        input,
        passwordHash,
        actor(request),
        idempotencyKey,
        requestHash(input)
      );
      return reply.code(result.replay ? 200 : 201).send(result.response);
    }
  );

  app.get("/v1/platform/businesses", { preHandler: platformRead }, async (request) => {
    const query = request.query as { q?: string };
    return { businesses: await listBusinesses(pool, query.q?.trim() || undefined) };
  });

  app.get(
    "/v1/platform/businesses/:businessId",
    { preHandler: platformRead },
    async (request) => {
      const { businessId } = request.params as { businessId: string };
      const business = await getBusinessDetail(pool, businessId);
      if (!business) throw new ApiError(404, "NOT_FOUND", "Business not found.");
      return business;
    }
  );

  for (const [action, active] of [["suspend", false], ["activate", true]] as const) {
    app.post(
      `/v1/platform/businesses/:businessId/${action}`,
      { preHandler: platformUpdate },
      async (request) => {
        const { businessId } = request.params as { businessId: string };
        return setBusinessActive(pool, businessId, active, actor(request));
      }
    );
  }

  app.put(
    "/v1/platform/businesses/:businessId/users/:userId/role",
    { preHandler: [app.authenticate, app.requireScope("platform"), app.requirePermission("platform:user:role:update")] },
    async (request) => {
      const input = parseInput(roleAssignmentRequestSchema, request.body);
      const { businessId, userId } = request.params as { businessId: string; userId: string };
      return assignBusinessRole(pool, businessId, userId, input, actor(request));
    }
  );
}

function actor(request: FastifyRequest) {
  if (!request.auth) throw new ApiError(401, "AUTH_TOKEN_MISSING", "Authentication is required.");
  return {
    userId: request.auth.userId,
    role: request.auth.role,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"]
  };
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function requestHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
