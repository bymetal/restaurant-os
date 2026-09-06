import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { systemIssueIdParamsSchema } from "@restaurant-os/contracts";
import { ApiError } from "../errors.js";
import {
  getGmvSeries,
  getPlatformOverview,
  getSystemIssuesSummary,
  listAuditLogs,
  resolveSystemIssue
} from "../repositories/platform-analytics.js";
import { parseInput } from "../validation.js";

export function registerPlatformAnalyticsRoutes(app: FastifyInstance, pool: Pool): void {
  const readAccess = [app.authenticate, app.requireScope("platform"), app.requirePermission("platform:analytics:read")];

  app.get("/v1/platform/analytics/overview", { preHandler: readAccess }, async () => ({
    overview: await getPlatformOverview(pool)
  }));

  app.get("/v1/platform/analytics/gmv-series", { preHandler: readAccess }, async (request) => {
    const query = request.query as { days?: string };
    const days = Math.min(90, Math.max(1, Number(query.days ?? 31)));
    return { series: await getGmvSeries(pool, days) };
  });

  app.get("/v1/platform/analytics/system-issues", { preHandler: readAccess }, async () => ({
    issues: await getSystemIssuesSummary(pool)
  }));

  app.get("/v1/platform/audit-logs", { preHandler: readAccess }, async () => ({
    logs: await listAuditLogs(pool, 100)
  }));

  app.post(
    "/v1/platform/analytics/system-issues/:issueId/resolve",
    { preHandler: [app.authenticate, app.requireScope("platform"), app.requirePermission("platform:system_issue:update")] },
    async (request) => {
      const { issueId } = parseInput(systemIssueIdParamsSchema, request.params);
      await resolveSystemIssue(pool, issueId, actorFrom(request));
      return { success: true };
    }
  );
}

function actorFrom(request: FastifyRequest) {
  if (!request.auth) throw new ApiError(401, "AUTH_TOKEN_MISSING", "Authentication is required.");
  return {
    userId: request.auth.userId,
    role: request.auth.role,
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"]
  };
}
