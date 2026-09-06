import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import { buildApp } from "./app.js";

const authConfig = {
  jwtSecret: "test-jwt-secret-test-jwt-secret-test-jwt-secret",
  jwtIssuer: "test-issuer",
  jwtAudience: "test-audience",
  accessTokenTtlSeconds: 900,
  refreshTokenTtlDays: 30,
  refreshCookieName: "test_refresh",
  refreshCookieSecure: false,
  allowedOrigins: ["http://127.0.0.1:4000"]
};

describe("API health endpoints", () => {
  it("reports liveness without infrastructure dependencies", async () => {
    const app = buildApp(
      {
        checkDatabase: async () => undefined,
        checkRedis: async () => undefined,
        pool: {} as Pool,
        redis: {} as Redis,
        publicRateLimitPerMinute: 120,
        authConfig
      },
      { logger: false }
    );

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "api" });
    await app.close();
  });

  it("returns 503 when a readiness dependency is down", async () => {
    const app = buildApp(
      {
        checkDatabase: async () => {
          throw new Error("database unavailable");
        },
        checkRedis: async () => undefined,
        pool: {} as Pool,
        redis: {} as Redis,
        publicRateLimitPerMinute: 120,
        authConfig
      },
      { logger: false }
    );

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "not_ready",
      dependencies: { database: "down", redis: "ok" }
    });
    await app.close();
  });

  it("rejects protected routes without an access token", async () => {
    const app = buildApp(
      {
        checkDatabase: async () => undefined,
        checkRedis: async () => undefined,
        pool: {} as Pool,
        redis: {} as Redis,
        publicRateLimitPerMinute: 120,
        authConfig
      },
      { logger: false }
    );

    const response = await app.inject({ method: "GET", url: "/v1/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "AUTH_TOKEN_MISSING" } });
    await app.close();
  });
});
