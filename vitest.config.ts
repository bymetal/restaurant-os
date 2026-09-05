import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@restaurant-os/config": fileURLToPath(new URL("./packages/config/src/index.ts", import.meta.url)),
      "@restaurant-os/contracts": fileURLToPath(new URL("./packages/contracts/src/index.ts", import.meta.url)),
      "@restaurant-os/db": fileURLToPath(new URL("./packages/db/src/index.ts", import.meta.url))
    }
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"]
  }
});
