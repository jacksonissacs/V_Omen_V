import path from "node:path"
import { defineConfig } from "vitest/config"

/**
 * Production-build + disposable PostgreSQL + Chrome workflow tests.
 * Requires OMEN_TEST_DATABASE_ADMIN_URL, `npm run build`, and Chrome.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.workflow.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
})
