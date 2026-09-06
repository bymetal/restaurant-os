import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import type { AuthScope, RoleName } from "@restaurant-os/domain";

export interface AuthConfig {
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  refreshCookieName: string;
  refreshCookieSecure: boolean;
  allowedOrigins: string[];
}

export interface AccessTokenInput {
  userId: string;
  tokenVersion: number;
  scope: AuthScope;
  businessId?: string;
}

export interface AccessTokenClaims {
  userId: string;
  tokenVersion: number;
  scope: AuthScope;
  businessId?: string;
}

export function createRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiry(config: AuthConfig, now = new Date()): Date {
  return new Date(now.getTime() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1_000);
}

export async function signAccessToken(input: AccessTokenInput, config: AuthConfig): Promise<string> {
  const payload: Record<string, string | number> = {
    scope: input.scope,
    ver: input.tokenVersion
  };
  if (input.businessId) payload.businessId = input.businessId;

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setIssuer(config.jwtIssuer)
    .setAudience(config.jwtAudience)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .sign(secretKey(config));
}

export async function verifyAccessToken(token: string, config: AuthConfig): Promise<AccessTokenClaims> {
  const result = await jwtVerify(token, secretKey(config), {
    algorithms: ["HS256"],
    issuer: config.jwtIssuer,
    audience: config.jwtAudience
  });
  const claims = result.payload;
  const scope = claims.scope;
  const tokenVersion = claims.ver;
  if (
    typeof claims.sub !== "string" ||
    (scope !== "platform" && scope !== "business") ||
    typeof tokenVersion !== "number" ||
    (claims.businessId !== undefined && typeof claims.businessId !== "string")
  ) {
    throw new Error("Invalid access token claims");
  }

  const accessToken: AccessTokenClaims = {
    userId: claims.sub,
    tokenVersion,
    scope
  };
  if (typeof claims.businessId === "string") accessToken.businessId = claims.businessId;
  return accessToken;
}

export function authTokenRole(role: RoleName): RoleName {
  return role;
}

function secretKey(config: AuthConfig): Uint8Array {
  return new TextEncoder().encode(config.jwtSecret);
}

export function isExpired(payload: JWTPayload, now = Math.floor(Date.now() / 1_000)): boolean {
  return typeof payload.exp === "number" && payload.exp <= now;
}
