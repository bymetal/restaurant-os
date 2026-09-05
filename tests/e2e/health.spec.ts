import { expect, test } from "@playwright/test";

test("API liveness endpoint is reachable", async ({ request }) => {
  const response = await request.get("/health/live");

  expect(response.ok()).toBe(true);
  await expect(response.json()).resolves.toMatchObject({
    status: "ok",
    service: "api"
  });
});
