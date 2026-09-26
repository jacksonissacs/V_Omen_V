import path from "node:path"
import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // PostgreSQL integration tests need a disposable server; run them with `npm run test:db`.
    exclude: [...configDefaults.exclude, "src/**/*.db.test.ts", "src/**/*.workflow.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
  esbuild: {
    jsx: "automatic",
  },
})
