// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.spec.ts"],
    coverage: {
      reporter: ["text", "json", "html", "lcov"],
    },
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/playwright/**",
      "**/tests/playwright/**",
    ],
  },
});
