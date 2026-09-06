import { createHash, randomBytes } from "node:crypto";

export function createStorefrontSession(): string {
  return randomBytes(32).toString("base64url");
}

export function hashStorefrontSession(session: string): string {
  return createHash("sha256").update(session).digest("hex");
}
