import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("API health endpoints", () => {
  it("reports liveness without infrastructure dependencies", async () => {
    const app = buildApp(
      {
        checkDatabase: async () => undefined,
        checkRedis: async () => undefined
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
        checkRedis: async () => undefined
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
});
