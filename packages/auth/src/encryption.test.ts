import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./encryption.js";

describe("secret encryption", () => {
  it("round-trips a plaintext value", () => {
    const secret = "a".repeat(32);
    const encoded = encryptSecret("evolution-api-key-123", secret);

    expect(encoded).not.toContain("evolution-api-key-123");
    expect(decryptSecret(encoded, secret)).toBe("evolution-api-key-123");
  });

  it("fails to decrypt with the wrong key", () => {
    const encoded = encryptSecret("top-secret", "a".repeat(32));

    expect(() => decryptSecret(encoded, "b".repeat(32))).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptSecret("not-a-valid-payload", "a".repeat(32))).toThrow("Invalid encrypted payload format.");
  });
});
