import path from "node:path"
import { defineConfig } from "vitest/config"

/** PostgreSQL integration tests. Requires OMEN_TEST_DATABASE_ADMIN_URL; see docs/database.md. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
})
