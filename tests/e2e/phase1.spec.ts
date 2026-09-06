import { expect, test } from "@playwright/test";

test("protected Phase 1 endpoints require authentication", async ({ request }) => {
  const response = await request.get("/v1/me");

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({
    error: { code: "AUTH_TOKEN_MISSING" }
  });
});
