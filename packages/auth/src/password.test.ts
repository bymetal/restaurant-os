import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("hashes and verifies a password with Argon2id", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");

    await expect(verifyPassword(passwordHash, "correct horse battery staple")).resolves.toBe(true);
    await expect(verifyPassword(passwordHash, "wrong password")).resolves.toBe(false);
    expect(passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("rejects short passwords before hashing", async () => {
    await expect(hashPassword("too-short")).rejects.toThrow("12 characters");
  });
});
