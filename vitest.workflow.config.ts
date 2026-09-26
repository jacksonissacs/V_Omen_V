import path from "node:path"
import { defineConfig } from "vitest/config"

/**
 * Deterministic production-build workflow.
 * Uses disposable PostgreSQL, `next start`, and Chrome.
 * It does not call external sources. `npm run intake:check` is the separate smoke check.
 * Requires OMEN_TEST_DATABASE_ADMIN_URL, `npm run build`, and Chrome.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.workflow.test.ts"],
    fileParallelism: false,
    sequence: { concurrent: false },
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
