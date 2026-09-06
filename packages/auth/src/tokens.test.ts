import { describe, expect, it } from "vitest";
import {
  createRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
  type AuthConfig
} from "./tokens.js";

const config: AuthConfig = {
  jwtSecret: "test-jwt-secret-test-jwt-secret-test-jwt-secret",
  jwtIssuer: "test-issuer",
  jwtAudience: "test-audience",
  accessTokenTtlSeconds: 900,
  refreshTokenTtlDays: 30,
  refreshCookieName: "test_refresh",
  refreshCookieSecure: false,
  allowedOrigins: []
};

describe("access and refresh tokens", () => {
  it("signs and verifies access token claims", async () => {
    const token = await signAccessToken(
      { userId: "2fd7b80f-3f05-4a4f-9f42-f6f0b99d579a", tokenVersion: 3, scope: "business", businessId: "63f4b8e4-4a9a-4d91-8c6b-f29c0ef0b3f1" },
      config
    );

    await expect(verifyAccessToken(token, config)).resolves.toMatchObject({
      userId: "2fd7b80f-3f05-4a4f-9f42-f6f0b99d579a",
      tokenVersion: 3,
      scope: "business",
      businessId: "63f4b8e4-4a9a-4d91-8c6b-f29c0ef0b3f1"
    });
    await expect(verifyAccessToken(`${token}tampered`, config)).rejects.toThrow();
  });

  it("creates one-way refresh token hashes", () => {
    const token = createRefreshToken();

    expect(token).not.toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).toHaveLength(64);
    expect(createRefreshToken()).not.toBe(token);
  });
});
