import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: process.env.CI ? "dot" : "list",
  use: {
    baseURL: "http://127.0.0.1:4000"
  },
  webServer: {
    command: "pnpm build && cross-env PORT=4000 pnpm --filter @restaurant-os/api start",
    url: "http://127.0.0.1:4000/health/live",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
