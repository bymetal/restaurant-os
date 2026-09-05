import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.js";

describe("runtime environment", () => {
  it("provides safe local defaults", () => {
    const env = parseEnv({ NODE_ENV: "test" });

    expect(env.PORT).toBe(4_000);
    expect(env.DATABASE_URL).toContain("restaurant_os");
  });

  it("rejects development secrets in production", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow("Production secrets");
  });

  it("coerces a configured port", () => {
    const env = parseEnv({ NODE_ENV: "test", PORT: "4100" });

    expect(env.PORT).toBe(4_100);
  });
});
